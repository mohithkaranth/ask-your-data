import { NextResponse } from "next/server";
import { sql } from "@/lib/db";

export async function POST(req: Request) {
  try {
    const { email } = await req.json();

    const users = await sql`
      SELECT * FROM users WHERE email = ${email}
    `;

    if (users.length === 0) {
      return NextResponse.json({ success: false });
    }

    return NextResponse.json({
      success: true,
      user: users[0],
    });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ success: false });
  }
}