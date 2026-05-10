// Supabase handles email verification via its own confirmation links.
// This route exists only for backward-compat redirects from old emails.
import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({ message: "Email verification is handled by Supabase Auth." });
}

export async function POST() {
  return NextResponse.json({ message: "Email verification is handled by Supabase Auth." });
}
