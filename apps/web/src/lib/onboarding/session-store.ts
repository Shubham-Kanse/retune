/**
 * session-store.ts
 * Thin DB adapter for onboarding_sessions and onboarding_extraction_jobs.
 * All SQL lives here — domain modules stay pure.
 */

import type { ProfileNormalized } from "@/lib/profile-domain/contracts";
import { createClient } from "@/lib/supabase/server";

// ─── Types (owned by this module) ─────────────────────────────────────────────

export type OnboardingStage = "greeting" | "collecting" | "complete";

export interface OnboardingState {
  stage: OnboardingStage;
  /** Index into the chat route's question queue (0 = greeting). */
  queueIndex: number;
  profileDelta: Partial<ProfileNormalized>;
  hardMinimumMet: boolean;
  extractionStatus: "none" | "pending" | "done" | "failed";
  confirmedSections: string[];
}

export interface StoredSession {
  id: string;
  userId: string;
  state: OnboardingState;
  messages: StoredMessage[];
}

export interface StoredMessage {
  role: "user" | "assistant" | "system";
  content: string;
  chips?: string[];
  card?: { section: "experience" | "skills" | "education"; data: unknown };
  ts: string;
}

export interface ExtractionJob {
  id: string;
  sessionId: string;
  userId: string;
  status: "pending" | "processing" | "done" | "failed";
  filename: string;
  contentHash: string;
  extractedJson: Partial<ProfileNormalized> | null;
  errorCode: string | null;
}

// ─── Initial state ────────────────────────────────────────────────────────────

export function initialOnboardingState(): OnboardingState {
  return {
    stage: "greeting",
    queueIndex: 0,
    profileDelta: {},
    hardMinimumMet: false,
    extractionStatus: "none",
    confirmedSections: [],
  };
}

// ─── Session ──────────────────────────────────────────────────────────────────

export async function resetSession(userId: string): Promise<void> {
  const supabase = await createClient();
  const init = initialOnboardingState();
  await supabase
    .from("onboarding_sessions")
    .update({
      stage: init.stage,
      messages: [],
      profile_delta: {},
      extraction_status: null,
      extraction_result: null,
      hard_minimum_met: false,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId);
}

export async function getOrCreateSession(userId: string): Promise<StoredSession> {
  const supabase = await createClient();

  const { data: existing } = await supabase
    .from("onboarding_sessions")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  if (existing) return rowToSession(existing);

  const init = initialOnboardingState();
  const { data: created, error } = await supabase
    .from("onboarding_sessions")
    .insert({
      user_id: userId,
      stage: init.stage,
      messages: [],
      profile_delta: init.profileDelta,
      extraction_status: null,
      extraction_result: null,
      hard_minimum_met: false,
    })
    .select("*")
    .single();

  if (error || !created) throw new Error(`Failed to create onboarding session: ${error?.message}`);
  return rowToSession(created);
}

export async function saveSession(
  userId: string,
  state: OnboardingState,
  messages: StoredMessage[],
): Promise<void> {
  const supabase = await createClient();
  await supabase
    .from("onboarding_sessions")
    .update({
      stage: state.stage,
      messages,
      profile_delta: state.profileDelta,
      extraction_status: state.extractionStatus === "none" ? null : state.extractionStatus,
      hard_minimum_met: state.hardMinimumMet,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId);
}

// ─── Extraction jobs ──────────────────────────────────────────────────────────

export async function findExtractionJobByHash(
  userId: string,
  contentHash: string,
): Promise<ExtractionJob | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("onboarding_extraction_jobs")
    .select("*")
    .eq("user_id", userId)
    .eq("content_hash", contentHash)
    .eq("status", "done")
    .maybeSingle();
  return data ? rowToJob(data) : null;
}

export async function createExtractionJob(params: {
  sessionId: string;
  userId: string;
  filename: string;
  contentHash: string;
}): Promise<string> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("onboarding_extraction_jobs")
    .insert({
      session_id: params.sessionId,
      user_id: params.userId,
      filename: params.filename,
      content_hash: params.contentHash,
      status: "pending",
    })
    .select("id")
    .single();
  if (error || !data) throw new Error(`Failed to create extraction job: ${error?.message}`);
  return data.id as string;
}

export async function markExtractionDone(
  jobId: string,
  result: Partial<ProfileNormalized>,
): Promise<void> {
  const supabase = await createClient();
  await supabase
    .from("onboarding_extraction_jobs")
    .update({
      status: "done",
      extracted_json: result,
      completed_at: new Date().toISOString(),
    })
    .eq("id", jobId);
}

export async function markExtractionFailed(jobId: string, errorCode: string): Promise<void> {
  const supabase = await createClient();
  await supabase
    .from("onboarding_extraction_jobs")
    .update({ status: "failed", error_code: errorCode, completed_at: new Date().toISOString() })
    .eq("id", jobId);
}

// ─── Row mappers ──────────────────────────────────────────────────────────────

// Legacy `stage` values in the DB may be one of the verbose engine names;
// collapse them to the three values we actually use here.
function normaliseStage(raw: unknown): OnboardingStage {
  if (raw === "complete") return "complete";
  if (raw === "greeting") return "greeting";
  return "collecting";
}

function deriveQueueIndex(profileDelta: Partial<ProfileNormalized>, messageCount: number): number {
  // Fall back to counting assistant turns in case the column is missing for
  // older rows; the chat route will re-normalise on save.
  return messageCount > 0 ? messageCount : Object.keys(profileDelta).length > 0 ? 1 : 0;
}

// biome-ignore lint/suspicious/noExplicitAny: supabase row
function rowToSession(row: any): StoredSession {
  const profileDelta = (row.profile_delta as Partial<ProfileNormalized>) ?? {};
  const messages: StoredMessage[] = (row.messages as StoredMessage[]) ?? [];
  const assistantCount = messages.filter((m) => m.role === "assistant").length;
  const state: OnboardingState = {
    stage: normaliseStage(row.stage),
    queueIndex:
      typeof row.queue_index === "number"
        ? row.queue_index
        : deriveQueueIndex(profileDelta, assistantCount),
    profileDelta,
    hardMinimumMet: row.hard_minimum_met ?? false,
    extractionStatus: row.extraction_status ?? "none",
    confirmedSections: (row.confirmed_sections as string[]) ?? [],
  };
  return {
    id: row.id as string,
    userId: row.user_id as string,
    state,
    messages,
  };
}

// biome-ignore lint/suspicious/noExplicitAny: supabase row
function rowToJob(row: any): ExtractionJob {
  return {
    id: row.id as string,
    sessionId: row.session_id as string,
    userId: row.user_id as string,
    status: row.status as ExtractionJob["status"],
    filename: row.filename as string,
    contentHash: row.content_hash as string,
    extractedJson: row.extracted_json as Partial<ProfileNormalized> | null,
    errorCode: row.error_code as string | null,
  };
}
