import { createClient } from "@/lib/supabase/server";
import { ValidationError } from "@/lib/errors";
import { withErrorHandling } from "@/lib/api-handler";
import { NextResponse } from "next/server";
import { z } from "zod";

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const POST = withErrorHandling(async (request) => {
  const body = await request.json().catch(() => { throw new ValidationError("Invalid JSON body"); });
  const parsed = schema.safeParse(body);
  if (!parsed.success) throw new ValidationError(parsed.error.issues[0]?.message ?? "Invalid input");

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) throw new ValidationError("Invalid email or password");

  return NextResponse.json({ userId: data.user.id });
});
