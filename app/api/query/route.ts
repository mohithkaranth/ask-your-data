export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { getProjectDb } from "@/lib/project-db";
import { buildSQL } from "@/lib/sqlBuilder";

function quoteIdent(name: string) {
  return `"${name.replace(/"/g, '""')}"`;
}

const MONTHS = [
  { name: "january", short: "jan", value: 1, label: "January" },
  { name: "february", short: "feb", value: 2, label: "February" },
  { name: "march", short: "mar", value: 3, label: "March" },
  { name: "april", short: "apr", value: 4, label: "April" },
  { name: "may", short: "may", value: 5, label: "May" },
  { name: "june", short: "jun", value: 6, label: "June" },
  { name: "july", short: "jul", value: 7, label: "July" },
  { name: "august", short: "aug", value: 8, label: "August" },
  { name: "september", short: "sep", value: 9, label: "September" },
  { name: "october", short: "oct", value: 10, label: "October" },
  { name: "november", short: "nov", value: 11, label: "November" },
  { name: "december", short: "dec", value: 12, label: "December" },
];

function extractMentionedMonths(question: string) {
  const lower = question.toLowerCase();

  return MONTHS.filter((month) => {
    const fullRegex = new RegExp(`\\b${month.name}\\b`, "i");
    const shortRegex = new RegExp(`\\b${month.short}\\b`, "i");

    return fullRegex.test(lower) || shortRegex.test(lower);
  });
}

function questionHasExplicitYear(question: string) {
  return /\b(19|20)\d{2}\b/.test(question);
}

function normalizeForMatch(value: string) {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function similarityScore(input: string, candidate: string) {
  const a = normalizeForMatch(input);
  const b = normalizeForMatch(candidate);

  if (!a || !b) return 0;
  if (a === b) return 1;
  if (b.includes(a) || a.includes(b)) return 0.95;

  const aChars = new Set(a.split(""));
  const bChars = new Set(b.split(""));

  const intersection = [...aChars].filter((char) => bChars.has(char)).length;
  const union = new Set([...aChars, ...bChars]).size;

  return union === 0 ? 0 : intersection / union;
}

function getFieldType(field: string, rawSemanticModel: any) {
  const [entityName, columnName] = field.split(".");

  const entity = rawSemanticModel.entities?.find(
    (e: any) => e.name === entityName
  );

  if (!entity) return null;

  const column = entity.columns?.find((c: any) => c.name === columnName);

  return column?.type || null;
}

async function resolveTextFilterValue(
  projectDb: any,
  rawSemanticModel: any,
  field: string,
  value: any
) {
  if (typeof value !== "string") return value;

  const fieldType = getFieldType(field, rawSemanticModel);

  if (fieldType !== "string" && fieldType !== "text") {
    return value;
  }

  const [table, column] = field.split(".");

  if (!table || !column) return value;

  const distinctSql = `
    SELECT DISTINCT ${quoteIdent(column)} AS value
    FROM ${quoteIdent(table)}
    WHERE ${quoteIdent(column)} IS NOT NULL
    LIMIT 200
  `;

  const rows = await projectDb.unsafe(distinctSql);
  const candidates = rows.map((row: any) => String(row.value));

  if (candidates.length === 0) return value;

  let bestCandidate = value;
  let bestScore = 0;

  for (const candidate of candidates) {
    const score = similarityScore(value, candidate);

    if (score > bestScore) {
      bestScore = score;
      bestCandidate = candidate;
    }
  }

  if (bestScore >= 0.65) {
    return bestCandidate;
  }

  return value;
}

async function resolveFilterValues(
  semanticQuery: any,
  projectDb: any,
  rawSemanticModel: any
) {
  const resolvedFilters = [];

  for (const filter of semanticQuery.filters || []) {
    resolvedFilters.push({
      ...filter,
      value: await resolveTextFilterValue(
        projectDb,
        rawSemanticModel,
        filter.field,
        filter.value
      ),
    });
  }

  const resolvedFilterGroups = [];

  for (const group of semanticQuery.filterGroups || []) {
    const resolvedGroup = [];

    for (const filter of group || []) {
      resolvedGroup.push({
        ...filter,
        value: await resolveTextFilterValue(
          projectDb,
          rawSemanticModel,
          filter.field,
          filter.value
        ),
      });
    }

    resolvedFilterGroups.push(resolvedGroup);
  }

  return {
    ...semanticQuery,
    filters: resolvedFilters,
    filterGroups: resolvedFilterGroups,
  };
}

function relaxExactNumericFiltersForReasoning(question: string, semanticQuery: any) {
  const shouldRelax =
    /\b(better|money-wise|moneywise|value|worth|idea)\b/i.test(question);

  if (!shouldRelax) {
    return semanticQuery;
  }

  const relaxedFilterGroups = (semanticQuery.filterGroups || []).map(
    (group: any[]) =>
      group.filter((filter: any) => {
        const isExactNumericFilter =
          filter.operator === "=" && typeof filter.value === "number";

        return !isExactNumericFilter;
      })
  );

  return {
    ...semanticQuery,
    filterGroups: relaxedFilterGroups,
  };
}

async function getDateContext(projectDb: any, rawSemanticModel: any) {
  const dateColumns =
    rawSemanticModel.entities?.flatMap((entity: any) =>
      entity.columns
        .filter((column: any) => column.type === "date")
        .map((column: any) => ({
          table: entity.name,
          column: column.name,
        }))
    ) || [];

  const dateContext: any[] = [];

  for (const dateColumn of dateColumns) {
    const query = `
      SELECT 
        MIN(${quoteIdent(dateColumn.column)}) AS min_date,
        MAX(${quoteIdent(dateColumn.column)}) AS max_date
      FROM ${quoteIdent(dateColumn.table)}
    `;

    const result = await projectDb.unsafe(query);

    if (result?.[0]?.min_date && result?.[0]?.max_date) {
      dateContext.push({
        field: `${dateColumn.table}.${dateColumn.column}`,
        minDate: String(result[0].min_date).slice(0, 10),
        maxDate: String(result[0].max_date).slice(0, 10),
      });
    }
  }

  return dateContext;
}

async function getAvailableMonthYears(projectDb: any, rawSemanticModel: any) {
  const dateColumns =
    rawSemanticModel.entities?.flatMap((entity: any) =>
      entity.columns
        .filter((column: any) => column.type === "date")
        .map((column: any) => ({
          table: entity.name,
          column: column.name,
        }))
    ) || [];

  const monthYearContext: any[] = [];

  for (const dateColumn of dateColumns) {
    const query = `
      SELECT DISTINCT
        EXTRACT(YEAR FROM ${quoteIdent(dateColumn.column)})::int AS year,
        EXTRACT(MONTH FROM ${quoteIdent(dateColumn.column)})::int AS month
      FROM ${quoteIdent(dateColumn.table)}
      WHERE ${quoteIdent(dateColumn.column)} IS NOT NULL
      ORDER BY year, month
    `;

    const result = await projectDb.unsafe(query);

    monthYearContext.push({
      field: `${dateColumn.table}.${dateColumn.column}`,
      values: result.map((row: any) => ({
        year: Number(row.year),
        month: Number(row.month),
      })),
    });
  }

  return monthYearContext;
}

function resolveMonthAmbiguity(question: string, monthYearContext: any[]) {
  const mentionedMonths = extractMentionedMonths(question);

  if (mentionedMonths.length === 0) {
    return {
      type: "none",
      hints: [],
      message: null,
    };
  }

  if (questionHasExplicitYear(question)) {
    return {
      type: "explicit_year",
      hints: [],
      message: null,
    };
  }

  const hints: any[] = [];
  const ambiguousMessages: string[] = [];
  const missingMessages: string[] = [];

  for (const mentionedMonth of mentionedMonths) {
    const years = Array.from(
      new Set(
        monthYearContext.flatMap((ctx) =>
          ctx.values
            .filter((value: any) => value.month === mentionedMonth.value)
            .map((value: any) => value.year)
        )
      )
    ).sort();

    if (years.length === 0) {
      missingMessages.push(
        `${mentionedMonth.label} does not appear in the available date data.`
      );
    }

    if (years.length === 1) {
      hints.push({
        monthName: mentionedMonth.label,
        month: mentionedMonth.value,
        year: years[0],
      });
    }

    if (years.length > 1) {
      ambiguousMessages.push(
        `${mentionedMonth.label} appears in multiple years: ${years.join(", ")}.`
      );
    }
  }

  if (ambiguousMessages.length > 0) {
    const firstMonth = mentionedMonths[0];
    const suggestedYear = Array.from(
      new Set(
        monthYearContext.flatMap((ctx) =>
          ctx.values
            .filter((value: any) => value.month === firstMonth.value)
            .map((value: any) => value.year)
        )
      )
    )[0];

    return {
      type: "ambiguous",
      hints: [],
      message: `${ambiguousMessages.join(
        " "
      )} Which year do you mean? For example, ask "number of bookings in ${
        firstMonth.label
      } ${suggestedYear}".`,
    };
  }

  if (missingMessages.length > 0) {
    return {
      type: "missing",
      hints: [],
      message: `${missingMessages.join(
        " "
      )} Please try a month/year that exists in the data.`,
    };
  }

  return {
    type: "resolved",
    hints,
    message: null,
  };
}

async function mapQuestionToSemanticQuery(
  question: string,
  semanticModel: any,
  dateContext: any[],
  monthYearContext: any[],
  dateResolutionHints: any[]
) {
  const dimensionsWithTypes = semanticModel.entities
    .flatMap((e: any) =>
      e.columns.map((c: any) => `${e.name}.${c.name} (${c.type})`)
    )
    .join(", ");

  const dateFields = semanticModel.entities
    .flatMap((e: any) =>
      e.columns
        .filter((c: any) => c.type === "date")
        .map((c: any) => `${e.name}.${c.name}`)
    )
    .join(", ");

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `
You are a semantic query generator.

ONLY use the following metrics and dimensions.

METRICS:
${Object.keys(semanticModel.metrics).join(", ")}

DIMENSIONS:
${dimensionsWithTypes}

VALID DATE FIELDS:
${dateFields || "None"}

AVAILABLE DATE RANGE FROM DATA:
${JSON.stringify(dateContext, null, 2)}

AVAILABLE MONTH/YEAR VALUES FROM DATA:
${JSON.stringify(monthYearContext, null, 2)}

DETERMINISTIC DATE RESOLUTION HINTS:
${JSON.stringify(dateResolutionHints, null, 2)}

FILTER FORMAT:
- field must be one of the DIMENSIONS above, without the type label
- operator: =, !=, >, <, >=, <=
- value: string, number, or date in YYYY-MM-DD format

DATE RULES:
- You MUST use ONLY fields marked as (date) for any date filter
- NEVER use id, numeric, or string fields for date comparisons
- If no date field exists, return no filters
- If DETERMINISTIC DATE RESOLUTION HINTS contains a month/year, you MUST use that exact year
- For a month filter, use a date range:
  - first filter: >= first day of month
  - second filter: < first day of next month

LOOKUP / PRICE / RATE RULES:
- If the user asks for rates, prices, cost, fee, charge, or "how much", this is usually a lookup question, not an aggregate question.
- For lookup questions, prefer returning relevant columns as dimensions instead of using sum/count metrics.
- If the user asks "how much would it cost" for a specific duration, return the relevant amount/price/rate field as a dimension and filter by the matching numeric duration field.
- For rate/cost lookup questions, include the rate/price field, the relevant descriptive text field, and any numeric condition field such as duration_hours in dimensions.
- If the user asks a comparison question involving cost, price, rate, money-wise, value, better, cheaper, or expensive, retrieve enough candidate rows for reasoning instead of only exact matches.
- If an exact numeric value may not exist in the data, do not over-filter to only that exact value. Include the relevant descriptive field, numeric field, and price/rate field so the answer layer can reason from available rows.
- For rate/cost comparison questions, prefer dimensions that show the available options, such as descriptive name/type fields, duration/quantity fields, and amount/price/rate fields.
- Do NOT use count(*) or sum(...) unless the user asks for totals, counts, revenue, average, top, highest, or lowest.
- If a user asks about a duration/quantity/amount that may not exist exactly, do not filter only to that exact numeric value. Retrieve available rows for the relevant named option and include the numeric field in dimensions so the answer layer can reason from nearby available values.
- For "better", "money-wise", "value", or comparison questions, prefer retrieving candidate rows for each named option rather than requiring every numeric condition to match exactly.

VALUE FILTER RULES:
- If the user mentions a specific named/descriptive value such as a room name, customer name, country, instrument, product, status, type, category, or other business value, you MUST add a filter using the most relevant text dimension.
- Choose the filter field ONLY from the available DIMENSIONS.
- Prefer text fields whose names include: name, room, customer, country, instrument, type, status, category, product.
- Do NOT ignore named values in the question.
- For text filters, use operator "=". The backend will resolve fuzzy/misspelled values against actual database values.
- If the user mentions a numeric duration, amount, quantity, price, or rate, add a numeric filter using the most relevant numeric field.

COMPARISON / OR FILTER RULES:
- If the user compares two or more alternatives, use "filterGroups".
- Each alternative must be represented as one filter group.
- Conditions inside one group are ANDed together.
- Different groups are ORed together.
- Do NOT put mutually exclusive alternatives into the normal "filters" array.
- Use normal "filters" only for conditions that apply to all alternatives.
- Choose fields only from available DIMENSIONS.
- For named/descriptive values, use the most relevant text dimension.
- For numeric values such as duration, amount, quantity, price, or rate, use the most relevant numeric field.
- For comparison questions, include in dimensions every field needed to identify each option being compared, including the compared text field and numeric condition fields.
- If alternatives differ by a numeric duration, include that duration field in dimensions.
- Do not return only the compared value; include enough fields for the final answer to identify which row belongs to which option.

ORDERING:
- For "top", "highest", "best", "more expensive", "costlier", "highest cost" use DESC
- For "lowest", "least", "cheapest", "least expensive" use ASC
- orderBy.field should be a metric when using aggregate metrics
- For lookup/rate/cost questions without aggregate metrics, orderBy.field may be a selected numeric dimension
- Use limit for top N queries

RULES:
- Use ONLY the exact names above
- Do NOT invent names
- You MUST use field names EXACTLY as provided
- Do NOT shorten or modify field names
- Output ONLY one valid JSON object. Do not include markdown, explanation, comments, or text before/after the JSON.

FORMAT:
{
  "metrics": [],
  "dimensions": [],
  "filters": [
    { "field": "", "operator": "", "value": "" }
  ],
  "filterGroups": [
    [
      { "field": "", "operator": "", "value": "" }
    ]
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

async function synthesizeAnswer({
  question,
  semanticQuery,
  sql,
  rows,
  warning,
}: {
  question: string;
  semanticQuery: any;
  sql: string;
  rows: any[];
  warning?: string | null;
}) {
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
You are a helpful data analyst.

Use only the provided SQL result rows. Do not invent data.

Your job:
- Answer the user's question in plain English.
- If the question is subjective, such as "better", explain the possible interpretations.
- If relevant, compare options using the returned values.
- If the result is empty, say no matching rows were found and suggest what may be missing.
- If the exact requested option is missing but nearby/relevant rows are available, explain that clearly.
- You may make a conditional estimate only if it is based on visible rows, and you must state the assumption.
- Example style: "There is no exact 3-hour rate. If combining a 2-hour and 1-hour rate is allowed, the estimate would be..."
- Do not treat assumptions as facts.
- Keep the answer concise.
- Do not show SQL unless asked.
          `,
        },
        {
          role: "user",
          content: JSON.stringify(
            {
              question,
              semanticQuery,
              sql,
              rows,
              warning,
            },
            null,
            2
          ),
        },
      ],
      temperature: 0,
    }),
  });

  const data = await res.json();

  console.log("ANSWER RAW RESPONSE:", JSON.stringify(data, null, 2));

  if (!data.choices || !data.choices[0]) {
    return "I got the data, but could not generate a written answer.";
  }

  return data.choices[0].message.content;
}

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

  const validFilterGroups = (semanticQuery.filterGroups || [])
    .map((group: any[]) =>
      group.filter((f: any) => {
        const isValid = validFields.has(f.field);
        if (!isValid) removed = true;
        return isValid;
      })
    )
    .filter((group: any[]) => group.length > 0);

  return {
    query: {
      ...semanticQuery,
      filters: validFilters,
      filterGroups: validFilterGroups,
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

    const raw =
      typeof semanticRow.semantic_json === "string"
        ? JSON.parse(semanticRow.semantic_json)
        : semanticRow.semantic_json;

    const metricsMap: Record<string, { formula: string; table?: string }> = {};
    raw.metrics.forEach((m: any) => {
      metricsMap[m.name] = {
        formula: m.formula,
        table: m.table,
      };
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

    const projectDb = getProjectDb(project.db_connection_string);

    const dateContext = await getDateContext(projectDb, raw);
    const monthYearContext = await getAvailableMonthYears(projectDb, raw);

    console.log("DATE CONTEXT:", dateContext);
    console.log("MONTH/YEAR CONTEXT:", monthYearContext);

    const dateResolution = resolveMonthAmbiguity(query, monthYearContext);

    if (dateResolution.message) {
      return NextResponse.json({
        success: true,
        answer: dateResolution.message,
        semanticQuery: null,
        data: [],
        sql: "",
        warning: "Date clarification required",
      });
    }

    let semanticQuery = await mapQuestionToSemanticQuery(
      query,
      semanticModel,
      dateContext,
      monthYearContext,
      dateResolution.hints
    );

    console.log("SEMANTIC QUERY (RAW):", semanticQuery);

    const { query: validatedQuery, warning } = validateFilters(
      semanticQuery,
      semanticModel
    );

    semanticQuery = validatedQuery;

    semanticQuery = await resolveFilterValues(semanticQuery, projectDb, raw);

    semanticQuery = relaxExactNumericFiltersForReasoning(query, semanticQuery);

    console.log("SEMANTIC QUERY (RESOLVED):", semanticQuery);

    if (!semanticQuery.metrics && !semanticQuery.dimensions) {
      throw new Error("Invalid semantic query generated");
    }

    const generatedSQL = buildSQL(semanticQuery, semanticModel);

    console.log("\nGenerated SQL:\n", generatedSQL);

    const result = await projectDb.unsafe(generatedSQL);

    const answer = await synthesizeAnswer({
      question: query,
      semanticQuery,
      sql: generatedSQL,
      rows: result,
      warning,
    });

    return NextResponse.json({
      success: true,
      answer,
      semanticQuery,
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