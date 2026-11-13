import { NextResponse } from "next/server";
import { sql } from "@/lib/db";

export async function POST(req: Request) {
  try {
    const { projectId, semantic } = await req.json();
    if (!projectId || !Array.isArray(semantic?.entities) ||
      !Array.isArray(semantic.relationships) || !Array.isArray(semantic.metrics)) {
      return NextResponse.json({ success: false, error: "Select a project and provide a valid semantic model." }, { status: 400 });
    }

    const serialized = JSON.stringify(semantic);
    const saved = await sql.begin(async tx => {
      // Serialize first-time publishes for this project even without a unique index.
      const [project] = await tx`SELECT id FROM projects WHERE id = ${projectId} FOR UPDATE`;
      if (!project) return false;

      const updated = await tx`
        UPDATE semantic_models SET semantic_json = ${serialized}
        WHERE project_id = ${projectId} RETURNING project_id
      `;
      if (!updated.length) {
        await tx`
          INSERT INTO semantic_models (project_id, semantic_json)
          VALUES (${projectId}, ${serialized})
        `;
      }
      return true;
    });

    if (!saved) {
      return NextResponse.json({ success: false, error: "Project not found." }, { status: 404 });
    }
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Semantic model publish failed", err);
    return NextResponse.json({ success: false, error: "Could not save the model to the application database." }, { status: 500 });
  }
}
