import { getSession } from "@/lib/session";
import {
  ResumeFileValidationError,
  importResumeAndPersist,
} from "@/lib/profile-domain";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 });

    const result = await importResumeAndPersist({
      file,
      source: "onboarding_upload",
      session,
      markOnboardingCompleted: false,
      saveConversation: true,
    });

    return NextResponse.json({
      extracted: result.extracted,
      missingQuestions: result.missingQuestions,
      stage: 1,
      ingestionId: result.ingestionId,
      completenessScore: result.completenessScore,
    });
  } catch (error) {
    if (error instanceof ResumeFileValidationError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("[onboarding/upload] failed", error);
    return NextResponse.json({ error: "Failed to process resume. Please try again." }, { status: 500 });
  }
}
