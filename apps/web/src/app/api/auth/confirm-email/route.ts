// Supabase handles email confirmation via its own confirmation links.
import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json({ message: "Email confirmation is handled by Supabase Auth." });
}
