import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { getProjectDb } from "@/lib/project-db";

export async function GET() {
  try {
    // 1. get project
    const project = await sql`
      SELECT * FROM projects LIMIT 1
    `;

    const conn = project[0].db_connection_string;

    // 2. connect to project DB
    const projectDb = getProjectDb(conn);

    // 3. test query on THAT DB
    const result = await projectDb`SELECT NOW()`;

    return NextResponse.json({
      success: true,
      project: project[0].name,
      result,
    });
  } catch (err) {
    return NextResponse.json({ success: false, error: err });
  }
}