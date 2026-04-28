import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { getProjectDb } from "@/lib/project-db";
import * as XLSX from "xlsx";

export async function POST(req: Request) {
  try {
    const formData = await req.formData();

    const file = formData.get("file") as File;
    const projectId = formData.get("projectId") as string;

    if (!file || !projectId) {
      return NextResponse.json({ success: false, error: "Missing input" });
    }

    // 1. Get project
    const projectRes = await sql`
      SELECT * FROM projects WHERE id = ${projectId}
    `;

    const project = projectRes[0];
    if (!project) {
      return NextResponse.json({ success: false, error: "Project not found" });
    }

    const projectDb = getProjectDb(project.db_connection_string);

    // 2. Read Excel
    const buffer = Buffer.from(await file.arrayBuffer());
    const workbook = XLSX.read(buffer, { type: "buffer" });

    const tablesSheet = XLSX.utils.sheet_to_json(
      workbook.Sheets["tables"]
    );

    const columnsSheet = XLSX.utils.sheet_to_json(
      workbook.Sheets["columns"]
    );

    const relationshipsSheet = XLSX.utils.sheet_to_json(
      workbook.Sheets["relationships"]
    );

    // 3. Build table map
    const tables: any = {};

    tablesSheet.forEach((t: any) => {
      tables[t.table_name] = [];
    });

    columnsSheet.forEach((col: any) => {
      const table = col.table_name;

      if (!tables[table]) return;

      let colDef = `${col.column_name} ${mapType(col.data_type)}`;

      if (col.is_primary === "yes") {
        colDef += " PRIMARY KEY";
      }

      tables[table].push(colDef);
    });

    // 4. DROP + CREATE tables
    for (const tableName of Object.keys(tables)) {
      const cols = tables[tableName].join(", ");

      // DROP first (clean reset)
      const dropSQL = `DROP TABLE IF EXISTS ${tableName} CASCADE;`;
      await projectDb.unsafe(dropSQL);

      // CREATE fresh
      const createSQL = `
        CREATE TABLE ${tableName} (${cols});
      `;

      await projectDb.unsafe(createSQL);
    }

    // 5. Add relationships (FKs)
    for (const rel of relationshipsSheet as any[]) {
      const fromTable = rel.from_table;
      const fromColumn = rel.from_column;
      const toTable = rel.to_table;
      const toColumn = rel.to_column;

      const constraintName = `fk_${fromTable}_${fromColumn}`;

      const fkSQL = `
        ALTER TABLE ${fromTable}
        ADD CONSTRAINT ${constraintName}
        FOREIGN KEY (${fromColumn})
        REFERENCES ${toTable}(${toColumn})
        ON DELETE CASCADE;
      `;

      try {
        await projectDb.unsafe(fkSQL);
      } catch (e) {
        console.log(`FK ${constraintName} may already exist, skipping...`);
      }
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ success: false, error: err });
  }
}

// helper
function mapType(type: string) {
  const t = type.toLowerCase();

  // UUID
  if (t.includes("uuid")) return "UUID";

  // NUMERIC TYPES
  if (
    t === "numeric" ||           // 👈 explicit
    t === "number" ||            // 👈 explicit
    t.includes("int") ||
    t.includes("decimal") ||
    t.includes("float") ||
    t.includes("double")
  ) {
    return "NUMERIC";
  }

  // DATE / TIME
  if (t.includes("date")) return "DATE";
  if (t.includes("time")) return "TIMESTAMP";

  // DEFAULT
  return "TEXT";
}
