import { NextResponse } from "next/server";
import { sql } from "@/lib/db";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);

  const email = searchParams.get("email");
  const projectId = searchParams.get("projectId");

  if (!email || !projectId) {
    return NextResponse.json({ favourites: [] });
  }

  const favourites = await sql`
    SELECT qf.id, qf.question, qf.created_at
    FROM question_favourites qf
    JOIN users u
      ON qf.user_id = u.id
    WHERE u.email = ${email}
      AND qf.project_id = ${projectId}
    ORDER BY qf.created_at DESC
  `;

  return NextResponse.json({ favourites });
}

export async function POST(req: Request) {
  const body = await req.json();

  const email = body.email;
  const projectId = body.projectId;
  const question = body.question;

  if (!email || !projectId || !question) {
    return NextResponse.json(
      { success: false, error: "Missing email, projectId, or question" },
      { status: 400 }
    );
  }

  const userRows = await sql`
    SELECT id
    FROM users
    WHERE email = ${email}
    LIMIT 1
  `;

  if (userRows.length === 0) {
    return NextResponse.json(
      { success: false, error: "User not found" },
      { status: 404 }
    );
  }

  const userId = userRows[0].id;

  const favouriteRows = await sql`
    INSERT INTO question_favourites (user_id, project_id, question)
    VALUES (${userId}, ${projectId}, ${question})
    ON CONFLICT (user_id, project_id, question)
    DO UPDATE SET question = EXCLUDED.question
    RETURNING id, question, created_at
  `;

  return NextResponse.json({
    success: true,
    favourite: favouriteRows[0],
  });
}

export async function DELETE(req: Request) {
  const body = await req.json();

  const email = body.email;
  const favouriteId = body.favouriteId;

  if (!email || !favouriteId) {
    return NextResponse.json(
      { success: false, error: "Missing email or favouriteId" },
      { status: 400 }
    );
  }

  await sql`
    DELETE FROM question_favourites qf
    USING users u
    WHERE qf.user_id = u.id
      AND u.email = ${email}
      AND qf.id = ${favouriteId}
  `;

  return NextResponse.json({ success: true });
}