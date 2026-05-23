import { withErrorHandling } from "@/lib/api-handler";
import { ValidationError } from "@/lib/errors";
import { createIdentityModule } from "@/lib/identity";
import { extractRequestContext, recordSecurityEvent } from "@/lib/security-audit";
import { NextResponse } from "next/server";
import { z } from "zod";

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const POST = withErrorHandling(async (request) => {
  const ctx = extractRequestContext(request);
  const body = await request.json().catch(() => {
    throw new ValidationError("Invalid JSON body");
  });
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    void recordSecurityEvent({
      event_type: "auth.login.invalid_payload",
      actor_kind: "anonymous",
      outcome: "denied",
      ...ctx,
      metadata: { reason: parsed.error.issues[0]?.message ?? "schema" },
    });
    throw new ValidationError(parsed.error.issues[0]?.message ?? "Invalid input");
  }

  const identity = createIdentityModule();
  try {
    const result = await identity.signIn(parsed.data);
    void recordSecurityEvent({
      event_type: "auth.login.success",
      user_id: (result as { userId?: string })?.userId ?? null,
      actor_kind: "user",
      outcome: "success",
      ...ctx,
      metadata: { email_domain: parsed.data.email.split("@")[1] ?? null },
    });
    return NextResponse.json(result);
  } catch (err) {
    void recordSecurityEvent({
      event_type: "auth.login.failed",
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
