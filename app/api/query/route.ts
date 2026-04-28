export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { getProjectDb } from "@/lib/project-db";
import { buildSQL } from "@/lib/sqlBuilder";

async function mapQuestionToSemanticQuery(
  question: string,
  semanticModel: any
) {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `
You are a semantic query generator.

ONLY use the following metrics and dimensions.

METRICS:
${Object.keys(semanticModel.metrics).join(", ")}

DIMENSIONS:
${semanticModel.entities
  .flatMap((e: any) =>
    e.columns.map((c: any) => `${e.name}.${c.name}`)
  )
  .join(", ")}

FILTER FORMAT:
- field must be one of the DIMENSIONS above
- operator: =, >, <, >=, <=
- value: string, number, or date in YYYY-MM-DD format

DATE RULES:
- You MUST use ONLY fields marked as (date) for any date filter
- NEVER use id, numeric, or string fields for date comparisons
- If no (date) field exists, return no filters
- For "last X days", use operator >= with a date field

ORDERING:
- For "top", "highest", "best" → use DESC
- For "lowest", "least" → use ASC
- orderBy.field MUST be a metric
- Use limit for top N queries

RULES:
- Use ONLY the exact names above
- Do NOT invent names
- You MUST use field names EXACTLY as provided
- Do NOT shorten or modify field names
- Output ONLY valid JSON

FORMAT:
{
  "metrics": [],
  "dimensions": [],
  "filters": [
    { "field": "", "operator": "", "value": "" }
  ],
  "orderBy": {
    "field": "",
    "direction": "asc | desc"
  },
  "limit": 10
}
          `,
        },
        {
          role: "user",
          content: question,
        },
      ],
      temperature: 0,
    }),
  });

  const data = await res.json();

  console.log("OPENAI RAW RESPONSE:", JSON.stringify(data, null, 2));

  if (!data.choices || !data.choices[0]) {
    throw new Error(
      "OpenAI API error: " + (data.error?.message || "Invalid response")
    );
  }

  const text = data.choices[0].message.content;

  return JSON.parse(text);
}

// 🔥 NEW: VALIDATION FUNCTION
function validateFilters(semanticQuery: any, semanticModel: any) {
  const validFields = new Set(
    semanticModel.entities.flatMap((e: any) =>
      e.columns.map((c: any) => `${e.name}.${c.name}`)
    )
  );

  let removed = false;

  const validFilters = (semanticQuery.filters || []).filter((f: any) => {
    const isValid = validFields.has(f.field);
    if (!isValid) removed = true;
    return isValid;
  });

  return {
    query: {
      ...semanticQuery,
      filters: validFilters,
    },
    warning: removed ? "Some filters were ignored due to invalid fields" : null,
  };
}

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const { projectId, query } = body;

    if (!projectId || !query) {
      return NextResponse.json(
        { success: false, error: "Missing projectId or query" },
        { status: 400 }
      );
    }

    // 1️⃣ Get project (main DB)
    const projectRes = await sql`
      SELECT * FROM projects WHERE id = ${projectId}
    `;

    const project = projectRes[0];

    if (!project) {
      return NextResponse.json(
        { success: false, error: "Project not found" },
        { status: 404 }
      );
    }

    // 2️⃣ Get semantic model
    const semanticRes = await sql`
      SELECT * FROM semantic_models WHERE project_id = ${projectId}
    `;

    const semanticRow = semanticRes[0];

    if (!semanticRow) {
      return NextResponse.json(
        { success: false, error: "Semantic model not found" },
        { status: 404 }
      );
    }

    // 3️⃣ Parse semantic JSON
    const raw =
      typeof semanticRow.semantic_json === "string"
        ? JSON.parse(semanticRow.semantic_json)
        : semanticRow.semantic_json;

    const metricsMap: Record<string, string> = {};
    raw.metrics.forEach((m: any) => {
      metricsMap[m.name] = m.formula;
    });

    const relationships = raw.relationships.map((r: any) => ({
      from: r.from_table,
      to: r.to_table,
      on: `${r.from_table}.${r.from_column} = ${r.to_table}.${r.to_column}`,
    }));

    const semanticModel = {
      entities: raw.entities,
      metrics: metricsMap,
      relationships,
    };

    console.log("SEMANTIC MODEL:", semanticModel);

    // 4️⃣ Map user query → semanticQuery
    let semanticQuery = await mapQuestionToSemanticQuery(
      query,
      semanticModel
    );

    console.log("SEMANTIC QUERY (RAW):", semanticQuery);

    // 🔥 APPLY VALIDATION
   const { query: validatedQuery, warning } = validateFilters(
  semanticQuery,
  semanticModel
);

semanticQuery = validatedQuery;

    console.log("SEMANTIC QUERY (VALIDATED):", semanticQuery);

    // 5️⃣ Guard
    if (!semanticQuery.metrics) {
      throw new Error("Invalid semantic query generated");
    }

    // 6️⃣ Generate SQL
    const generatedSQL = buildSQL(semanticQuery, semanticModel);

    console.log("\nGenerated SQL:\n", generatedSQL);

    // 7️⃣ Connect to project DB
    const projectDb = getProjectDb(project.db_connection_string);

    // 8️⃣ Execute query
    const result = await projectDb.unsafe(generatedSQL);

    // 9️⃣ Return result
    return NextResponse.json({
  success: true,
  data: result,
  sql: generatedSQL,
  warning,
});
  } catch (err: any) {
    console.error("QUERY API ERROR:", err);

    return NextResponse.json(
      { success: false, error: err.message || "Unknown error" },
      { status: 500 }
    );
  }
}