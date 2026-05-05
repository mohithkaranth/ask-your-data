import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { getProjectDb } from "@/lib/project-db";

type Column = {
  table_name: string;
  column_name: string;
  data_type: string;
};

type Relationship = {
  from_table: string;
  from_column: string;
  to_table: string;
  to_column: string;
};

export async function POST(req: Request) {
  try {
    const { projectId } = await req.json();

    if (!projectId) {
      return NextResponse.json({ error: "Missing projectId" }, { status: 400 });
    }

    // 🔹 1. Get project (MAIN DB)
    const project = await sql`
      SELECT * FROM projects WHERE id = ${projectId}
    `;

    if (!project.length) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    // 🔹 2. Connect to PROJECT DB
    const projectDb = getProjectDb(project[0].db_connection_string);

    // 🔹 3. Fetch schema from PROJECT DB
    const columns: Column[] = await projectDb`
      SELECT table_name, column_name, data_type
      FROM information_schema.columns
      WHERE table_schema = 'public'
    `;

    if (!columns.length) {
      return NextResponse.json(
        { error: "No tables found in project DB" },
        { status: 400 }
      );
    }

    // 🔹 4. Build entities
    const entitiesMap: Record<string, any> = {};

    columns.forEach((col) => {
      if (!entitiesMap[col.table_name]) {
        entitiesMap[col.table_name] = {
          name: col.table_name,
          columns: [],
        };
      }

      let type = "string";

      if (
        col.data_type.includes("int") ||
        col.data_type.includes("numeric") ||
        col.data_type.includes("decimal") ||
        col.data_type.includes("double") ||
        col.data_type.includes("float")
      ) {
        type = "number";
      }

      if (
        col.data_type.includes("date") ||
        col.data_type.includes("timestamp")
      ) {
        type = "date";
      }

      entitiesMap[col.table_name].columns.push({
        name: col.column_name,
        type,
      });
    });

    const entities = Object.values(entitiesMap);

    // 🔹 5. Relationships
    // Use real foreign keys from the project DB instead of guessing table names.
    const relationships: Relationship[] = await projectDb`
      SELECT
        tc.table_name AS from_table,
        kcu.column_name AS from_column,
        ccu.table_name AS to_table,
        ccu.column_name AS to_column
      FROM information_schema.table_constraints AS tc
      JOIN information_schema.key_column_usage AS kcu
        ON tc.constraint_name = kcu.constraint_name
       AND tc.table_schema = kcu.table_schema
      JOIN information_schema.constraint_column_usage AS ccu
        ON ccu.constraint_name = tc.constraint_name
       AND ccu.table_schema = tc.table_schema
      WHERE tc.constraint_type = 'FOREIGN KEY'
        AND tc.table_schema = 'public'
    `;

    // 🔹 6. Metrics
    const metrics: any[] = [];

    Object.keys(entitiesMap).forEach((table) => {
      metrics.push({
        name: `count_${table}`,
        table,
        formula: "count(*)",
      });

      entitiesMap[table].columns.forEach((col: any) => {
        const isNumeric =
          col.type === "number" ||
          ["quantity", "price", "avg_price", "amount_paid", "duration_hours"].includes(
            col.name
          );

        if (isNumeric) {
          metrics.push({
            name: `sum_${table}_${col.name}`,
            table,
            formula: `sum(CAST(${table}.${col.name} AS numeric))`,
          });
        }
      });
    });

    // 🔹 7. Dimensions
    const dimensions: any[] = [];

    columns.forEach((col) => {
      if (
        col.data_type.includes("char") ||
        col.data_type.includes("text") ||
        col.data_type.includes("date")
      ) {
        dimensions.push({
          table: col.table_name,
          column: col.column_name,
          type: col.data_type,
        });
      }
    });

    // 🔹 8. Final JSON
    const semanticDraft = {
      entities,
      relationships,
      metrics,
      dimensions,
    };

    // 🔹 9. Save
    await sql`
      INSERT INTO semantic_models (project_id, semantic_json)
      VALUES (${projectId}, ${JSON.stringify(semanticDraft)})
      ON CONFLICT (project_id)
      DO UPDATE SET semantic_json = EXCLUDED.semantic_json
    `;

    return NextResponse.json({
      success: true,
      semanticDraft,
    });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}