import { ValidationError } from "@/lib/errors";
import { withErrorHandling } from "@/lib/api-handler";
import { createIdentityModule } from "@/lib/identity";
import { NextResponse } from "next/server";
import { z } from "zod";

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const POST = withErrorHandling(async (request) => {
  const body = await request.json().catch(() => {
    throw new ValidationError("Invalid JSON body");
  });
  const parsed = schema.safeParse(body);
  if (!parsed.success) throw new ValidationError(parsed.error.issues[0]?.message ?? "Invalid input");

  const identity = createIdentityModule();
  const result = await identity.signIn(parsed.data);
  return NextResponse.json(result);
});
