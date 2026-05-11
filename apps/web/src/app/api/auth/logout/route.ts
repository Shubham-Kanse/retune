import { withErrorHandling } from "@/lib/api-handler";
import { createIdentityModule } from "@/lib/identity";
import { NextResponse } from "next/server";

export const POST = withErrorHandling(async () => {
  const identity = createIdentityModule();
  const result = await identity.signOut();
  return NextResponse.json(result);
});
