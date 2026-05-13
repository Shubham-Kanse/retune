/**
 * POST /api/onboarding/upload
 *
 * Pure extraction endpoint. Extracts structured profile fields from a resume file.
 * Does NOT mutate session state — the client sends extracted fields to POST /chat
 * as { kind: "resume_data", profile: {...} }.
 */
import { getSession } from "@/lib/session";
import { ResumeFileValidationError } from "@/lib/profile-domain";
import { extractProfileFromResumeFile } from "@/lib/profile-domain/extractors/openai-resume-extractor";
import { readAndValidateResumeFile } from "@/lib/profile-domain/utils/resume-file";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 });

    const { buffer, mediaType } = await readAndValidateResumeFile(file);

    const { extracted } = await extractProfileFromResumeFile({
      filename: file.name,
      mediaType,
      buffer,
      existingProfile: null,
    });

    if (!extracted) {
      return NextResponse.json({ error: "Could not extract profile from resume" }, { status: 422 });
    }

    return NextResponse.json({ result: extracted });
  } catch (err) {
    if (err instanceof ResumeFileValidationError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("[onboarding/upload]", err);
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }
}
