import { NextResponse } from "next/server";
import { sql } from "@/lib/db";

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const { projectId, semantic } = body;

    if (!projectId || !semantic) {
      return NextResponse.json({ success: false, error: "Missing input" });
    }

    // Remove existing semantic model for this project
    await sql`
      DELETE FROM semantic_models
      WHERE project_id = ${projectId}
    `;

    // Insert new semantic model
    await sql`
      INSERT INTO semantic_models (project_id, semantic_json)
      VALUES (${projectId}, ${semantic})
    `;

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ success: false, error: err });
  }
}