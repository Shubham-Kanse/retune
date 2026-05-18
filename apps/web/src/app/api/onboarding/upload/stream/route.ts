import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json(
    {
      error: "legacy_onboarding_removed",
      message: "The legacy onboarding flow has been removed. Use /onboarding-v2.",
      next: "/onboarding-v2/upload/stream",
    },
    { status: 410 },
  );
}
