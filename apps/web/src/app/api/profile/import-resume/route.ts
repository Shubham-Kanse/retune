import { withAuth } from "@/lib/api-handler";
import { importResumeAndPersist } from "@/lib/profile-domain/services/resume-import-orchestrator";
import {
  assertValidResumeFile,
  ResumeFileValidationError,
} from "@/lib/profile-domain/utils/resume-file";
import { NextResponse } from "next/server";

export const POST = withAuth(async (request, session) => {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 });
    assertValidResumeFile(file);

    const result = await importResumeAndPersist({
      file,
      source: "profile_upload",
      session,
      markOnboardingCompleted: true,
      saveConversation: false,
    });

    return NextResponse.json({
      profile: result.extracted,
      completenessScore: result.completenessScore,
      missingQuestions: result.missingQuestions,
      ingestionId: result.ingestionId,
    });
  } catch (error) {
    if (error instanceof ResumeFileValidationError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("[profile/import-resume] failed", error);
    return NextResponse.json({ error: "Failed to process resume. Please try again." }, { status: 500 });
  }
});
