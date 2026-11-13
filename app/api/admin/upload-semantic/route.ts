import { NextResponse } from "next/server";
import { sql } from "@/lib/db";

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const { projectId, semantic } = body;

    if (!projectId || !semantic) {
      return NextResponse.json({ success: false, error: "Missing input" });
    }

    await sql`
      INSERT INTO semantic_models (project_id, semantic_json)
      VALUES (${projectId}, ${JSON.stringify(semantic)})
      ON CONFLICT (project_id)
      DO UPDATE SET semantic_json = EXCLUDED.semantic_json
    `;
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ success: false, error: err });
  }
}