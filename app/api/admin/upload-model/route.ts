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

    const tablesSheet = XLSX.utils.sheet_to_json(workbook.Sheets["tables"]);

    const columnsSheet = XLSX.utils.sheet_to_json(workbook.Sheets["columns"]);

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

      const isPrimary =
  String(col.is_primary || "").trim().toLowerCase() === "yes" ||
  String(col.is_primary || "").trim().toLowerCase() === "y" ||
  String(col.is_primary || "").trim().toLowerCase() === "true" ||
  String(col.is_primary || "").trim() === "1";

if (isPrimary) {
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
    // Existing Excel format:
    // left_table | right_table | join_type | join_condition
    // Example:
    // studio_rooms.id = bookings.room_id
    //
    // This means:
    // bookings.room_id -> studio_rooms.id
    for (const rel of relationshipsSheet as any[]) {
      const joinCondition = rel.join_condition;

      if (!joinCondition || typeof joinCondition !== "string") {
        return NextResponse.json({
          success: false,
          error: "Invalid relationship row",
          details: `Missing join_condition in relationships sheet`,
        });
      }

      const parts = joinCondition.split("=");

      if (parts.length !== 2) {
        return NextResponse.json({
          success: false,
          error: "Invalid join_condition format",
          details: joinCondition,
        });
      }

      const left = parts[0].trim();
      const right = parts[1].trim();

      const [leftTable, leftColumn] = left.split(".").map((x) => x.trim());
      const [rightTable, rightColumn] = right.split(".").map((x) => x.trim());

      if (!leftTable || !leftColumn || !rightTable || !rightColumn) {
        return NextResponse.json({
          success: false,
          error: "Invalid relationship columns",
          details: joinCondition,
        });
      }

      const leftIsPrimary = leftColumn === "id";
      const rightIsPrimary = rightColumn === "id";

      let fromTable = rightTable;
      let fromColumn = rightColumn;
      let toTable = leftTable;
      let toColumn = leftColumn;

      if (rightIsPrimary && !leftIsPrimary) {
        fromTable = leftTable;
        fromColumn = leftColumn;
        toTable = rightTable;
        toColumn = rightColumn;
      }

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
        console.log(`FK created: ${constraintName}`);
      } catch (e) {
        console.error(`Failed to create FK: ${constraintName}`, e);
        return NextResponse.json({
          success: false,
          error: `Failed to create FK: ${constraintName}`,
          details: String(e),
        });
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
    t === "numeric" ||
    t === "number" ||
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