import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const projectId = searchParams.get("projectId");

    if (!projectId) {
      return NextResponse.json(
        { error: "Missing projectId" },
        { status: 400 }
      );
    }

    const result = await sql`
      SELECT semantic_json
      FROM semantic_models
      WHERE project_id = ${projectId}
      LIMIT 1
    `;

    if (result.length > 0) {
      return NextResponse.json({
        exists: true,
        semantic: result[0].semantic_json,
      });
    }

    return NextResponse.json({ exists: false });

  } catch (error) {
    console.error("Error fetching semantic:", error);
    return NextResponse.json(
      { error: "Failed to fetch semantic" },
      { status: 500 }
    );
  }
}