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

    // 1. get project
    const projectRes = await sql`
      SELECT * FROM projects WHERE id = ${projectId}
    `;

    const project = projectRes[0];
    if (!project) {
      return NextResponse.json({ success: false, error: "Project not found" });
    }

    const projectDb = getProjectDb(project.db_connection_string);

    // 2. read file
    const buffer = Buffer.from(await file.arrayBuffer());
    const workbook = XLSX.read(buffer, { type: "buffer" });

    const sheetNames = workbook.SheetNames;

    // 3. loop sheets (each sheet = table)
    for (const sheetName of sheetNames) {
      const sheet = workbook.Sheets[sheetName];
      const rows: any[] = XLSX.utils.sheet_to_json(sheet);

      if (rows.length === 0) continue;

      const columns = Object.keys(rows[0]);

      for (const row of rows) {
        const values = columns.map((col) => row[col]);

        const colsSQL = columns.join(", ");
        const valsSQL = values.map((_, i) => `$${i + 1}`).join(", ");

        const insertSQL = `
          INSERT INTO ${sheetName} (${colsSQL})
          VALUES (${valsSQL})
        `;

        await projectDb.unsafe(insertSQL, values);
      }
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ success: false, error: err });
  }
}