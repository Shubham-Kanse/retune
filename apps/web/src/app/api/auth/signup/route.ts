import { createClient } from "@/lib/supabase/server";
import { ConflictError, ValidationError } from "@/lib/errors";
import { withErrorHandling } from "@/lib/api-handler";
import { NextResponse } from "next/server";
import { z } from "zod";

const schema = z.object({
  email: z.string().email().max(254),
  password: z
    .string()
    .min(8)
    .max(128)
    .refine((v) => /[A-Z]/.test(v), "Password must contain uppercase letter")
    .refine((v) => /[a-z]/.test(v), "Password must contain lowercase letter")
    .refine((v) => /[0-9]/.test(v), "Password must contain number"),
  fullName: z.string().max(100).optional(),
});

export const POST = withErrorHandling(async (request) => {
  const body = await request.json().catch(() => { throw new ValidationError("Invalid JSON body"); });
  const parsed = schema.safeParse(body);
  if (!parsed.success) throw new ValidationError(parsed.error.issues[0]?.message ?? "Invalid input");

  const { email, password, fullName } = parsed.data;
  const supabase = await createClient();

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { full_name: fullName ?? null } },
  });

  if (error) {
    if (error.message.toLowerCase().includes("already")) throw new ConflictError("An account with this email already exists");
    throw new ValidationError(error.message);
  }

  return NextResponse.json({ userId: data.user?.id, emailVerificationSent: true });
});
