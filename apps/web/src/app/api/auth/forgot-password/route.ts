import { createClient } from "@/lib/supabase/server";
import { ValidationError } from "@/lib/errors";
import { withErrorHandling } from "@/lib/api-handler";
import { NextResponse } from "next/server";
import { z } from "zod";

const schema = z.object({ email: z.string().email() });

export const POST = withErrorHandling(async (request) => {
  const body = await request.json().catch(() => { throw new ValidationError("Invalid JSON body"); });
  const parsed = schema.safeParse(body);
  if (!parsed.success) throw new ValidationError(parsed.error.issues[0]?.message ?? "Invalid input");

  const supabase = await createClient();
  // Always return ok to prevent email enumeration
  await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/reset-password`,
  });

  return NextResponse.json({ ok: true });
});
