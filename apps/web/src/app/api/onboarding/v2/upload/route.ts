/**
 * POST /api/onboarding/v2/upload
 * Synchronous extraction — waits for the extractor and returns raw fields.
 * The chat route normalises on persist; we don't normalise here so we avoid
 * round-tripping a `ProfileNormalized` value through the browser only to
 * re-normalise on the way back in.
 *
 * GET /api/onboarding/v2/upload?jobId=… — legacy poll; always returns done.
 */

import { ResumeFileValidationError } from "@/lib/profile-domain";
import { extractProfileFromResumeFile } from "@/lib/profile-domain/extractors/openai-resume-extractor";
import { getProfileByUserId } from "@/lib/profile-domain/repositories/profile-repository";
import { readAndValidateResumeFile } from "@/lib/profile-domain/utils/resume-file";
import { getSession } from "@/lib/session";
import { NextResponse } from "next/server";

// GET — legacy poll endpoint, no longer needed but kept so old poll loops terminate.
export async function GET() {
  return NextResponse.json({ status: "done", result: null });
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 });

    const { buffer, mediaType } = await readAndValidateResumeFile(file);

    // Existing profile is cheap to fetch in parallel with the extractor
    // because the extractor dominates the wall-clock.
    const [existingProfile, { extracted }] = await Promise.all([
      getProfileByUserId(session.userId),
      extractProfileFromResumeFile({
        filename: file.name,
        mediaType,
        buffer,
        existingProfile: null,
      }),
    ]);
    // `existingProfile` could be used to merge, but the onboarding flow expects
    // the extractor to be authoritative for a fresh upload. Refer to
    // `services/resume-import-orchestrator.ts` for the merge path used by the
    // non-onboarding profile APIs.
    void existingProfile;

    if (!extracted) {
      return NextResponse.json({ error: "Could not extract profile from resume" }, { status: 422 });
    }

    return NextResponse.json({ result: extracted });
  } catch (err) {
    if (err instanceof ResumeFileValidationError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("[onboarding/v2/upload]", err);
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }
}
