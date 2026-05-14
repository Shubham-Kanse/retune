/**
 * POST /api/onboarding/upload
 *
 * Extracts structured profile fields from a resume file and persists the
 * extracted draft into the onboarding session.
 */
import { getSession } from "@/lib/session";
import { ResumeFileValidationError } from "@/lib/profile-domain";
import { extractProfileFromResumeFile } from "@/lib/profile-domain/extractors/openai-resume-extractor";
import { readAndValidateResumeFile } from "@/lib/profile-domain/utils/resume-file";
import { logOnboardingEvent } from "@/lib/onboarding/events";
import { getOrCreateSession, saveSession } from "@/lib/onboarding/session-store";
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

    const stored = await getOrCreateSession(session.userId);
    const nextState = { ...stored };
    applyExtractedProfile(nextState, extracted as Record<string, unknown>);
    nextState.meta = {
      ...nextState.meta,
      resumeUploaded: true,
      resumeParsed: true,
      currentPhase: "resume_summary",
    };

    await saveSession(session.userId, nextState);
    await logOnboardingEvent({
      userId: session.userId,
      sessionId: stored.id,
      eventType: "resume_parsed",
      payload: { filename: file.name, keys: Object.keys(extracted ?? {}) },
    });

    return NextResponse.json({ result: extracted, sessionSaved: true });
  } catch (err) {
    if (err instanceof ResumeFileValidationError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("[onboarding/upload]", err);
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }
}

function applyExtractedProfile(stored: Awaited<ReturnType<typeof getOrCreateSession>>, data: Record<string, unknown>) {
  const { profile } = stored;
  const now = new Date().toISOString();
  const field = <T>(value: T) => ({ value, source: "resume" as const, confidence: 0.8, confirmed: false, lastUpdatedAt: now });

  if (data.fullName) profile.identity.fullName = field(String(data.fullName));
  if (data.email) profile.identity.email = field(String(data.email));
  if (data.phone) profile.identity.phone = field(String(data.phone));
  if (data.location) profile.identity.location = field(String(data.location));
  if (data.linkedin) profile.identity.linkedin = field(String(data.linkedin));

  if (Array.isArray(data.experience)) {
    profile.experience = field(data.experience.map((e: any, i: number) => ({
      id: e.id ?? `exp-${i}`,
      title: e.title ?? "",
      company: e.company ?? "",
      location: e.location,
      startDate: e.startDate,
      endDate: e.endDate ?? "Present",
      isCurrent: e.isCurrent,
      responsibilities: Array.isArray(e.responsibilities) ? e.responsibilities : (e.description ? [e.description] : []),
      achievements: Array.isArray(e.achievements) ? e.achievements : [],
      tools: Array.isArray(e.tools) ? e.tools : [],
      skills: Array.isArray(e.skills) ? e.skills : [],
      domain: e.domain,
      confidence: 0.8,
    })));
  }

  if (Array.isArray(data.education)) {
    profile.education = field(data.education.map((e: any, i: number) => ({
      id: e.id ?? `edu-${i}`,
      degree: e.degree ?? "",
      institution: e.institution ?? "",
      fieldOfStudy: e.fieldOfStudy,
      graduationYear: e.graduationYear ?? e.endDate,
      location: e.location,
      grade: e.grade,
    })));
  }

  if (Array.isArray(data.skillsTier1)) profile.skills.technical = field(extractSkillNames(data.skillsTier1));
  else if (Array.isArray(data.technicalSkills)) profile.skills.technical = field(data.technicalSkills.map(String));
  else if (Array.isArray(data.skills)) profile.skills.technical = field(data.skills.map(String));

  if (Array.isArray(data.skillsTier2)) profile.skills.tools = field(extractSkillNames(data.skillsTier2));
  else if (Array.isArray(data.tools)) profile.skills.tools = field(data.tools.map(String));

  if (Array.isArray(data.skillsTier3)) profile.skills.business = field(extractSkillNames(data.skillsTier3));
  else if (Array.isArray(data.professionalSkills)) profile.skills.business = field(data.professionalSkills.map(String));
  if (data.currentTitle) profile.professionalProfile.currentTitles = field([String(data.currentTitle)]);
}

function extractSkillNames(values: unknown[]): string[] {
  return values
    .map((value) => {
      if (value && typeof value === "object" && "name" in value) {
        return String((value as { name?: unknown }).name ?? "");
      }
      return String(value ?? "");
    })
    .map((value) => value.trim())
    .filter(Boolean);
}
