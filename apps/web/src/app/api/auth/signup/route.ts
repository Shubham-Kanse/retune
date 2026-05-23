import { withErrorHandling } from "@/lib/api-handler";
import { ValidationError } from "@/lib/errors";
import { createIdentityModule } from "@/lib/identity";
import { extractRequestContext, recordSecurityEvent } from "@/lib/security-audit";
import { NextResponse } from "next/server";
import { z } from "zod";

const consentSchema = z
  .object({
    anthropic: z.boolean().optional(),
    openai: z.boolean().optional(),
    retune: z.boolean().optional(),
  })
  .optional();

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
  processorConsents: consentSchema,
});

export const POST = withErrorHandling(async (request) => {
  const ctx = extractRequestContext(request);
  const body = await request.json().catch(() => {
    throw new ValidationError("Invalid JSON body");
  });
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    void recordSecurityEvent({
      event_type: "auth.signup.invalid_payload",
      actor_kind: "anonymous",
      outcome: "denied",
      ...ctx,
      metadata: { reason: parsed.error.issues[0]?.message ?? "schema" },
    });
    throw new ValidationError(parsed.error.issues[0]?.message ?? "Invalid input");
  }

  // Require all three processor consents at API boundary (defence-in-depth;
  // UI also enforces). This blocks raw API calls that bypass the form.
  const c = parsed.data.processorConsents;
  if (!c?.anthropic || !c?.openai || !c?.retune) {
    void recordSecurityEvent({
      event_type: "auth.signup.consent_missing",
      actor_kind: "anonymous",
      outcome: "denied",
      ...ctx,
      metadata: { has_anthropic: !!c?.anthropic, has_openai: !!c?.openai, has_retune: !!c?.retune },
    });
    throw new ValidationError("All processor consents are required to create an account");
  }

  const identity = createIdentityModule();
  try {
    const result = await identity.signUp(parsed.data);
    void recordSecurityEvent({
      event_type: "auth.signup.success",
      user_id: (result as { userId?: string })?.userId ?? null,
      actor_kind: "user",
      outcome: "success",
      ...ctx,
      metadata: { email_domain: parsed.data.email.split("@")[1] ?? null },
    });
    return NextResponse.json(result);
  } catch (err) {
    void recordSecurityEvent({
      event_type: "auth.signup.failed",
      actor_kind: "anonymous",
      outcome: "denied",
      ...ctx,
      metadata: {
        email_domain: parsed.data.email.split("@")[1] ?? null,
        reason: err instanceof Error ? err.message.slice(0, 240) : "unknown",
      },
    });
    throw err;
  }
});
