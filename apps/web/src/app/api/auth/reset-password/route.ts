import { createClient } from "@/lib/supabase/server";
import { ValidationError } from "@/lib/errors";
import { withErrorHandling } from "@/lib/api-handler";
import { NextResponse } from "next/server";
import { z } from "zod";

const schema = z.object({
  password: z
    .string()
    .min(8)
    .max(128)
    .refine((v) => /[A-Z]/.test(v), "Password must contain uppercase letter")
    .refine((v) => /[a-z]/.test(v), "Password must contain lowercase letter")
    .refine((v) => /[0-9]/.test(v), "Password must contain number"),
});

export const POST = withErrorHandling(async (request) => {
  const body = await request.json().catch(() => { throw new ValidationError("Invalid JSON body"); });
  const parsed = schema.safeParse(body);
  if (!parsed.success) throw new ValidationError(parsed.error.issues[0]?.message ?? "Invalid input");

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) throw new ValidationError(error.message);

  return NextResponse.json({ ok: true });
});
