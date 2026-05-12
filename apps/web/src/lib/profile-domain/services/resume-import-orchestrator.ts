import { revalidatePath } from "next/cache";
import type { ImportSource } from "../enums";
import { extractProfileFromResumeFile } from "../extractors/openai-resume-extractor";
import { upsertOnboardingConversation } from "../repositories/onboarding-conversation-repository";
import { getProfileByUserId, persistProfile } from "../repositories/profile-repository";
import {
  computeContentHash,
  createIngestion,
  findIngestionByHash,
  updateIngestionResult,
} from "../repositories/resume-ingestion-repository";
import { buildMissingFieldQuestions } from "./missing-core";
import { mergeProfiles, normalizeProfile } from "./normalizer";
import { readAndValidateResumeFile } from "../utils/resume-file";

interface SessionLike {
  userId: string;
  email: string;
  fullName?: string | null;
}

export async function importResumeAndPersist(params: {
  file: File;
  source: ImportSource;
  session: SessionLike;
  markOnboardingCompleted: boolean;
  saveConversation: boolean;
}) {
  const { buffer, mediaType } = await readAndValidateResumeFile(params.file);
  const contentHash = computeContentHash(buffer);
  const existingIngestion = await findIngestionByHash(params.session.userId, contentHash);
  if (existingIngestion && existingIngestion.status === "ready" && existingIngestion.extractedProfileJson) {
    const parsed = JSON.parse(existingIngestion.extractedProfileJson) as Record<string, unknown>;
    const normalizedExisting = normalizeProfile(parsed, params.session.email, params.session.fullName ?? "");
    return {
      extracted: normalizedExisting,
      missingQuestions: buildMissingFieldQuestions(normalizedExisting),
      completenessScore: 0,
      ingestionId: existingIngestion.id,
    };
  }
  const ingestion = await createIngestion({
    userId: params.session.userId,
    source: params.source,
    filename: params.file.name,
    mediaType,
    sizeBytes: params.file.size,
    contentHash,
  });
  const existing = await getProfileByUserId(params.session.userId);

  const { assistantText, extracted } = await extractProfileFromResumeFile({
    filename: params.file.name,
    mediaType,
    buffer,
    existingProfile: existing,
  });

  if (params.saveConversation) {
    await upsertOnboardingConversation({
      userId: params.session.userId,
      stage: "conversation",
      messages: [
        { role: "user", content: `[Uploaded resume: ${params.file.name}]` },
        { role: "assistant", content: assistantText || "" },
      ],
    });
  }

  if (!extracted) {
    if (ingestion) {
      await updateIngestionResult({
        id: ingestion.id,
        status: "failed",
        stage: "conversation",
        errorCode: "extraction_failed",
        errorDetail: "Model returned invalid extraction payload",
      });
    }
    return {
      extracted: null,
      missingQuestions: [
        {
          field: "fullName",
          question: "What should we use as your full name on your profile and generated resume?",
          reason: "Resume extraction failed, so profile evidence is unavailable.",
          priority: "high",
          answerType: "text",
        },
        {
          field: "currentTitle",
          question: "What is your current job title?",
          reason: "Resume extraction failed, so profile evidence is unavailable.",
          priority: "high",
          answerType: "text",
        },
        {
          field: "experienceLevel",
          question: "How many years of professional experience do you have?",
          reason: "Resume extraction failed, so profile evidence is unavailable.",
          priority: "high",
          answerType: "single_select",
        },
        {
          field: "location",
          question: "What is your current location (city, country)?",
          reason: "Resume extraction failed, so profile evidence is unavailable.",
          priority: "high",
          answerType: "text",
        },
        {
          field: "targetRoles",
          question: "Which roles are you actively targeting right now?",
          reason: "Resume extraction failed, so profile evidence is unavailable.",
          priority: "high",
          answerType: "multi_select",
        },
        {
          field: "experience",
          question: "Please add your most recent role with key outcomes and metrics.",
          reason: "Resume extraction failed, so profile evidence is unavailable.",
          priority: "high",
          answerType: "list",
        },
      ],
      completenessScore: 0,
      ingestionId: ingestion?.id ?? null,
    };
  }

  const mergedRaw = mergeProfiles(existing ?? {}, extracted);
  const normalized = normalizeProfile(mergedRaw, params.session.email, params.session.fullName ?? "");
  const persisted = await persistProfile({
    userId: params.session.userId,
    sessionEmail: params.session.email,
    sessionFullName: params.session.fullName,
    profile: normalized,
    markOnboardingCompleted: params.markOnboardingCompleted,
  });

  revalidatePath("/dashboard");
  revalidatePath("/profile");
  if (ingestion) {
    await updateIngestionResult({
      id: ingestion.id,
      status: "ready",
      stage: "conversation",
      extractedProfileJson: JSON.stringify(normalized),
    });
  }

  return {
    extracted: normalized,
    missingQuestions: buildMissingFieldQuestions(normalized),
    completenessScore: persisted.completenessScore,
    ingestionId: ingestion?.id ?? null,
  };
}
