import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json(
    {
      error: "legacy_onboarding_removed",
      message: "The legacy onboarding flow has been removed. Use /onboarding-v2.",
      next: "/onboarding-v2",
    },
    { status: 410 },
  );
}
