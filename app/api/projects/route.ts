import { NextResponse } from "next/server";
import { sql } from "@/lib/db";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const email = searchParams.get("email");

  if (!email) {
    return NextResponse.json({ projects: [] });
  }

  const projects = await sql`
    SELECT p.id, p.name
    FROM users u
    JOIN user_projects up
      ON u.id = up.user_id
    JOIN projects p
      ON up.project_id = p.id
    WHERE u.email = ${email}
  `;

  return NextResponse.json({ projects });
}