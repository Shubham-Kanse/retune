/**
 * Postgres schema — canonical persistence for the cognitive workbench.
 *
 * This file is intentionally additive and *not* wired up at runtime yet.
 * The existing SQLite product (packages/db/src/schema.ts) continues to
 * own `apps/web`'s data path. This Postgres schema lands now so that
 * commit #3 can migrate the blackboard to a durable store without a
 * coordinated schema-design step.
 *
 * Subset covered by commit #2:
 *   - users, generations, documents, applications, outcomes
 *   - blackboard_snapshots (JSONB)
 *   - audit_entries (one row per orchestrator tick)
 *   - conflicts, goals, active_questions
 *   - evidence_spans, voice_centroids, honesty_calibrations
 *   - case_base_entries (pgvector), jd_clusters
 *   - ontology_versions
 *
 * Unimplemented in schema (commit #4+):
 *   - audit_log table (table-level audit vs per-tick audit_entries)
 *   - outbox / inbox pattern for Gmail ingestion
 *   - per-tenant row-level security policies (Postgres RLS definitions)
 *
 * Every table has:
 *   - a UUID primary key (default gen_random_uuid())
 *   - created_at / updated_at (timestamptz, default now())
 *   - deleted_at (timestamptz, nullable — soft delete, 30d hard-delete sweep)
 *
 * Extensions required at DB bootstrap (commit #3 migration):
 *   CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
 *   CREATE EXTENSION IF NOT EXISTS "pgcrypto";
 *   CREATE EXTENSION IF NOT EXISTS "vector";
 */

import { sql } from "drizzle-orm";
import {
  boolean,
  customType,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

// pgvector type helper
const vector = (name: string, dim: number) =>
  customType<{ data: number[]; driverData: string }>({
    dataType() { return `vector(${dim})`; },
    toDriver(v) { return `[${v.join(",")}]`; },
    fromDriver(v) { return (v as string).slice(1, -1).split(",").map(Number); },
  })(name);

const tcol = (name: string) => timestamp(name, { withTimezone: true }).notNull().defaultNow();
const tcol_nullable = (name: string) => timestamp(name, { withTimezone: true });
const now = () => tcol("created_at");
const updated = () => tcol("updated_at");
const deleted = () => tcol_nullable("deleted_at");

// ─────────────── Users ───────────────

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    email: varchar("email", { length: 320 }).notNull(),
    // Auth (consolidated from legacy SQLite v1 schema)
    passwordHash: text("password_hash"),
    fullName: text("full_name"),
    avatarUrl: text("avatar_url"),
    authProvider: varchar("auth_provider", { length: 32 }).notNull().default("email"),
    emailVerified: boolean("email_verified").notNull().default(false),
    emailVerificationToken: text("email_verification_token"),
    emailVerificationExpiresAt: timestamp("email_verification_expires_at", { withTimezone: true }),
    passwordChangedAt: timestamp("password_changed_at", { withTimezone: true }),
    onboardingCompleted: boolean("onboarding_completed").notNull().default(false),
    // Cognitive cycle metadata
    personaType: varchar("persona_type", { length: 32 }).notNull().default("experienced_ic"),
    market: varchar("market", { length: 8 }).notNull().default("US"),
    locale: varchar("locale", { length: 16 }).notNull().default("en-US"),
    kmsKeyId: text("kms_key_id"),
    onboardingCompletedAt: timestamp("onboarding_completed_at", { withTimezone: true }),
    dataResidencyRegion: varchar("data_residency_region", { length: 8 }).notNull().default("us"),
    createdAt: tcol("created_at"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: tcol_nullable("deleted_at"),
  },
  (t) => ({
    email_ux: uniqueIndex("users_email_ux").on(t.email).where(sql`deleted_at IS NULL`),
  }),
);

// ─────────────── JDs + clusters ───────────────

export const jd_clusters = pgTable("jd_clusters", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  canonical_hash: varchar("canonical_hash", { length: 64 }).notNull().unique(),
  analysis_blob: jsonb("analysis_blob"),
  member_count: integer("member_count").notNull().default(0),
  created_at: now(),
  updated_at: updated(),
});

export const jds = pgTable(
  "jds",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    source: varchar("source", { length: 32 }).notNull(),
    url: text("url"),
    content_hash: varchar("content_hash", { length: 64 }).notNull(),
    raw_text: text("raw_text").notNull(),
    parsed_at: timestamp("parsed_at", { withTimezone: true }),
    cluster_id: uuid("cluster_id").references(() => jd_clusters.id, { onDelete: "set null" }),
    created_at: now(),
    updated_at: updated(),
  },
  (t) => ({
    content_hash_ix: index("jds_content_hash_ix").on(t.content_hash),
    cluster_ix: index("jds_cluster_ix").on(t.cluster_id),
  }),
);

// ─────────────── Generations + blackboard + audit ───────────────

export const generations = pgTable(
  "generations",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    user_id: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    jd_id: uuid("jd_id").references(() => jds.id, { onDelete: "set null" }),
    ontology_version: varchar("ontology_version", { length: 32 }).notNull(),
    termination: varchar("termination", { length: 32 }),
    ticks_executed: integer("ticks_executed").notNull().default(0),
    total_cost_usd: doublePrecision("total_cost_usd").notNull().default(0),
    total_latency_ms: integer("total_latency_ms").notNull().default(0),
    current_blackboard: jsonb("current_blackboard"),
    started_at: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    completed_at: timestamp("completed_at", { withTimezone: true }),
    created_at: now(),
    updated_at: updated(),
    deleted_at: deleted(),
  },
  (t) => ({
    user_ix: index("generations_user_ix").on(t.user_id),
    jd_ix: index("generations_jd_ix").on(t.jd_id),
  }),
);

export const blackboard_snapshots = pgTable(
  "blackboard_snapshots",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    generation_id: uuid("generation_id")
      .notNull()
      .references(() => generations.id, { onDelete: "cascade" }),
    seq: integer("seq").notNull(),
    /** Full blackboard state at this seq. */
    snapshot: jsonb("snapshot").notNull(),
    created_at: now(),
  },
  (t) => ({
    gen_seq_ux: uniqueIndex("blackboard_snapshots_gen_seq_ux").on(t.generation_id, t.seq),
  }),
);

export const audit_entries = pgTable(
  "audit_entries",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    generation_id: uuid("generation_id")
      .notNull()
      .references(() => generations.id, { onDelete: "cascade" }),
    seq: integer("seq").notNull(),
    specialist: varchar("specialist", { length: 128 }).notNull(),
    micro_stage: varchar("micro_stage", { length: 128 }),
    inputs_hash: varchar("inputs_hash", { length: 64 }).notNull(),
    output_hash: varchar("output_hash", { length: 64 }).notNull(),
    justification: text("justification"),
    model_version: varchar("model_version", { length: 128 }),
    latency_ms: integer("latency_ms").notNull(),
    cost_usd: doublePrecision("cost_usd").notNull(),
    writes: jsonb("writes").notNull().default(sql`'[]'::jsonb`),
    recorded_at: timestamp("recorded_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    gen_seq_ux: uniqueIndex("audit_entries_gen_seq_ux").on(t.generation_id, t.seq),
    specialist_ix: index("audit_entries_specialist_ix").on(t.specialist),
  }),
);

export const conflicts = pgTable(
  "conflicts",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    generation_id: uuid("generation_id")
      .notNull()
      .references(() => generations.id, { onDelete: "cascade" }),
    monitor: varchar("monitor", { length: 128 }).notNull(),
    severity: varchar("severity", { length: 16 }).notNull(),
    kind: varchar("kind", { length: 128 }).notNull(),
    payload: jsonb("payload"),
    resolved_by_specialist: varchar("resolved_by_specialist", { length: 128 }),
    resolved_at: timestamp("resolved_at", { withTimezone: true }),
    created_at: now(),
  },
  (t) => ({
    gen_ix: index("conflicts_gen_ix").on(t.generation_id),
  }),
);

export const goals = pgTable(
  "goals",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    generation_id: uuid("generation_id")
      .notNull()
      .references(() => generations.id, { onDelete: "cascade" }),
    kind: varchar("kind", { length: 64 }).notNull(),
    priority: integer("priority").notNull(),
    emitted_by: varchar("emitted_by", { length: 128 }).notNull(),
    status: varchar("status", { length: 32 }).notNull(),
    payload: jsonb("payload"),
    parent_goal_id: uuid("parent_goal_id"),
    satisfied_by: jsonb("satisfied_by").notNull().default(sql`'[]'::jsonb`),
    created_at: now(),
    updated_at: updated(),
  },
  (t) => ({
    gen_ix: index("goals_gen_ix").on(t.generation_id),
    status_ix: index("goals_status_ix").on(t.status),
  }),
);

export const active_questions = pgTable("active_questions", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  user_id: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  generation_id: uuid("generation_id")
    .notNull()
    .references(() => generations.id, { onDelete: "cascade" }),
  goal_id: uuid("goal_id")
    .notNull()
    .references(() => goals.id, { onDelete: "cascade" }),
  question: text("question").notNull(),
  target_field: varchar("target_field", { length: 256 }).notNull(),
  /**
   * Dot-path into the parent goal's payload where the user's answer
   * should be injected when the answer-processing activity re-opens
   * the parent. NULL → fall back to the target_field heuristic
   * (hypotheses.role_schema → jd_title; hypotheses.company_schema → company).
   * Added in migration 0001.
   */
  parent_goal_field: varchar("parent_goal_field", { length: 128 }),
  answered_at: timestamp("answered_at", { withTimezone: true }),
  answer_text: text("answer_text"),
  asked_at: tcol("asked_at"),
});

// ─────────────── Evidence + calibration ───────────────

export const evidence_spans = pgTable(
  "evidence_spans",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    user_id: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    source_document_id: uuid("source_document_id").references(() => documents.id, { onDelete: "set null" }),
    start_offset: integer("start_offset").notNull(),
    end_offset: integer("end_offset").notNull(),
    text_snippet: text("text_snippet").notNull(),
    span_type: varchar("span_type", { length: 32 }).notNull(),
    confidence: doublePrecision("confidence").notNull(),
    provenance: varchar("provenance", { length: 32 }).notNull(),
    created_at: now(),
    updated_at: updated(),
    deleted_at: deleted(),
  },
  (t) => ({
    user_ix: index("evidence_spans_user_ix").on(t.user_id),
    type_ix: index("evidence_spans_type_ix").on(t.span_type),
  }),
);

export const voice_centroids = pgTable("voice_centroids", {
  user_id: uuid("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  /** 128-dim stylometric vector serialized as jsonb array. Moves to pgvector in commit #4. */
  vector: jsonb("vector").notNull(),
  sample_size: integer("sample_size").notNull().default(0),
  created_at: now(),
  updated_at: updated(),
});

export const honesty_calibrations = pgTable(
  "honesty_calibrations",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    user_id: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    claim_type: varchar("claim_type", { length: 64 }).notNull(),
    trust_factor: doublePrecision("trust_factor").notNull(),
    sample_size: integer("sample_size").notNull().default(0),
    created_at: now(),
    updated_at: updated(),
  },
  (t) => ({
    user_claim_ux: uniqueIndex("honesty_user_claim_ux").on(t.user_id, t.claim_type),
  }),
);

// ─────────────── Meta-layer: Emotional state + mood + motivation (§24) ───────────────

export const emotional_states = pgTable(
  "emotional_states",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    user_id: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    generation_id: uuid("generation_id").references(() => generations.id, { onDelete: "cascade" }),
    valence: doublePrecision("valence").notNull(),
    arousal: doublePrecision("arousal").notNull(),
    dominance: doublePrecision("dominance").notNull(),
    primary_emotion: varchar("primary_emotion", { length: 32 }).notNull(),
    confidence: doublePrecision("confidence").notNull(),
    source_signals: jsonb("source_signals").notNull().default(sql`'[]'::jsonb`),
    created_at: now(),
  },
  (t) => ({
    user_ix: index("emotional_states_user_ix").on(t.user_id, t.created_at),
    gen_ix: index("emotional_states_gen_ix").on(t.generation_id),
  }),
);

export const emotional_state_corrections = pgTable("emotional_state_corrections", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  emotional_state_id: uuid("emotional_state_id")
    .notNull()
    .references(() => emotional_states.id, { onDelete: "cascade" }),
  user_id: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  corrected_emotion: varchar("corrected_emotion", { length: 32 }).notNull(),
  feedback_text: text("feedback_text"),
  created_at: now(),
});

export const mood_fingerprints = pgTable(
  "mood_fingerprints",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    user_id: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    valence_avg: doublePrecision("valence_avg").notNull(),
    arousal_avg: doublePrecision("arousal_avg").notNull(),
    dominance_avg: doublePrecision("dominance_avg").notNull(),
    stability: doublePrecision("stability").notNull(),
    sample_window_hours: integer("sample_window_hours").notNull().default(168),
    sample_count: integer("sample_count").notNull().default(0),
    computed_at: tcol("computed_at"),
  },
  (t) => ({
    user_ix: index("mood_fingerprints_user_ix").on(t.user_id, t.computed_at),
  }),
);

export const motivation_modulators = pgTable(
  "motivation_modulators",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    user_id: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    claim_type: varchar("claim_type", { length: 64 }).notNull(),
    drive_level: doublePrecision("drive_level").notNull(),
    reward_history: jsonb("reward_history").notNull().default(sql`'[]'::jsonb`),
    last_reward_at: tcol_nullable("last_reward_at"),
    created_at: now(),
    updated_at: updated(),
  },
  (t) => ({
    user_claim_ux: uniqueIndex("motivation_user_claim_ux").on(t.user_id, t.claim_type),
  }),
);

// ─────────────── Applications + outcomes + docs ───────────────

export const documents = pgTable(
  "documents",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    generation_id: uuid("generation_id")
      .notNull()
      .references(() => generations.id, { onDelete: "cascade" }),
    kind: varchar("kind", { length: 32 }).notNull(),
    content: jsonb("content").notNull(),
    rendered_html: text("rendered_html"),
    rendered_pdf_url: text("rendered_pdf_url"),
    watermark_tag: varchar("watermark_tag", { length: 64 }),
    created_at: now(),
  },
  (t) => ({
    gen_kind_ux: uniqueIndex("documents_gen_kind_ux").on(t.generation_id, t.kind),
  }),
);

export const applications = pgTable(
  "applications",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    jdId: uuid("jd_id").references(() => jds.id, { onDelete: "set null" }),
    /**
     * Cognitive generation that produced this application. Nullable because
     * the web client inserts an `applications` row immediately on
     * `POST /api/generate` (status=`generating`) before the cognitive cycle
     * has materialised a `generations` row.
     */
    generationId: uuid("generation_id").references(() => generations.id, { onDelete: "set null" }),
    // ── Legacy v1 fields (consolidated from SQLite) ──
    companyName: text("company_name").notNull().default("Unknown"),
    roleTitle: text("role_title").notNull().default(""),
    jobDescription: text("job_description").notNull().default(""),
    jdUrl: text("jd_url"),
    market: varchar("market", { length: 8 }).notNull().default("us"),
    /** generating | completed | failed | cancelled | draft | submitted | … */
    status: varchar("status", { length: 32 }).notNull().default("draft"),
    currentStep: text("current_step"),
    stepsCompleted: text("steps_completed"),
    pipelineLog: text("pipeline_log"),
    companyIntel: text("company_intel"),
    atsScore: doublePrecision("ats_score"),
    atsReport: text("ats_report"),
    resumeDocxPath: text("resume_docx_path"),
    resumePdfPath: text("resume_pdf_path"),
    coverLetterDocxPath: text("cover_letter_docx_path"),
    coverLetterPdfPath: text("cover_letter_pdf_path"),
    refinementHistory: text("refinement_history"),
    resumeVersion: integer("resume_version").notNull().default(0),
    generationDurationMs: integer("generation_duration_ms"),
    tokenUsage: text("token_usage"),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    deletedAt: tcol_nullable("deleted_at"),
    createdAt: tcol("created_at"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    user_status_ix: index("applications_user_status_ix").on(t.userId, t.status),
    user_created_ix: index("applications_user_created_ix").on(t.userId, t.createdAt),
    user_company_ix: index("applications_user_company_ix").on(t.userId, t.companyName),
  }),
);

export const outcomes = pgTable(
  "outcomes",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    application_id: uuid("application_id")
      .notNull()
      .references(() => applications.id, { onDelete: "cascade" }),
    kind: varchar("kind", { length: 32 }).notNull(),
    captured_at: timestamp("captured_at", { withTimezone: true }).notNull().defaultNow(),
    source: varchar("source", { length: 32 }).notNull(),
    feedback_text: text("feedback_text"),
    created_at: now(),
  },
  (t) => ({
    app_ix: index("outcomes_app_ix").on(t.application_id),
  }),
);

// ─────────────── GDPR audit packets (v2.0 — technical-2.0 §10.2) ───────────────

/**
 * Persistent home for the Article 22 audit packet emitted by every
 * shipped or refused generation. Replayable; FK-cascades on user delete
 * to support the right to erasure.
 */
export const gdpr_packets = pgTable(
  "gdpr_packets",
  {
    generation_id: uuid("generation_id")
      .primaryKey()
      .references(() => generations.id, { onDelete: "cascade" }),
    user_id: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    verdict: varchar("verdict", { length: 16 }).notNull(),
    /** The full GdprAuditPacket JSON. */
    packet: jsonb("packet").notNull(),
    created_at: now(),
  },
  (t) => ({
    user_ix: index("gdpr_packets_user_ix").on(t.user_id, t.created_at),
  }),
);

// ─────────────── Case base + ontology ───────────────

export const case_base_entries = pgTable(
  "case_base_entries",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    jd_embedding: vector("jd_embedding", 1536).notNull(),
    profile_embedding: vector("profile_embedding", 1536).notNull(),
    document_embeddings: vector("document_embeddings", 1536).notNull(),
    outcome_kind: varchar("outcome_kind", { length: 32 }).notNull(),
    opt_in: boolean("opt_in").notNull().default(false),
    user_hash: varchar("user_hash", { length: 64 }).notNull(),
    created_at: now(),
  },
  (t) => ({
    optin_ix: index("case_base_optin_ix").on(t.opt_in),
  }),
);

export const ontology_versions = pgTable("ontology_versions", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  semver: varchar("semver", { length: 32 }).notNull().unique(),
  content_hash: varchar("content_hash", { length: 64 }).notNull(),
  migration_path: jsonb("migration_path"),
  deployed_at: timestamp("deployed_at", { withTimezone: true }),
  created_at: now(),
});

// ─────────────── Legacy v1 product tables (consolidated from SQLite) ───────────────

export const profiles = pgTable("profiles", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" })
    .unique(),
  fullName: text("full_name").notNull(),
  email: text("email").notNull(),
  phone: text("phone"),
  linkedin: text("linkedin"),
  location: text("location").notNull(),
  visaStatus: text("visa_status"),
  relocationPreferences: text("relocation_preferences"),
  targetRoles: text("target_roles").notNull(),
  experienceLevel: text("experience_level"),
  currentTitle: text("current_title"),
  experience: text("experience").notNull(),
  education: text("education").notNull(),
  certifications: text("certifications"),
  projects: text("projects"),
  skillsTier1: text("skills_tier1"),
  skillsTier2: text("skills_tier2"),
  skillsTier3: text("skills_tier3"),
  voiceNotes: text("voice_notes"),
  profileMarkdown: text("profile_markdown").notNull(),
  completenessScore: integer("completeness_score").notNull().default(0),
  createdAt: tcol("created_at"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const onboardingConversations = pgTable("onboarding_conversations", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  messages: text("messages").notNull(),
  stage: text("stage").notNull().default("upload"),
  resumeText: text("resume_text"),
  createdAt: tcol("created_at"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// billing_subscriptions is the canonical subscription table (legacy `subscriptions` dropped).
export const subscriptions = pgTable("billing_subscriptions", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" })
    .unique(),
  plan: text("plan").notNull().default("free"),
  status: text("status").notNull().default("active"),
  creditsUsed: integer("credits_used").notNull().default(0),
  stripeCustomerId: text("stripe_customer_id"),
  stripeSubscriptionId: text("stripe_sub_id"),
  currentPeriodStart: timestamp("current_period_start", { withTimezone: true }),
  currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }),
  cancelAtPeriodEnd: boolean("cancel_at_period_end").notNull().default(false),
  createdAt: tcol("created_at"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const passwordResetTokens = pgTable("password_reset_tokens", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  token: text("token").notNull().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: tcol("created_at"),
});

export const processorConsents = pgTable("processor_consents", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  /** anthropic | openai | retune */
  processor: text("processor").notNull(),
  granted: boolean("granted").notNull().default(false),
  grantedAt: timestamp("granted_at", { withTimezone: true }),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  createdAt: tcol("created_at"),
});

export const generationPreflights = pgTable(
  "generation_preflights",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    jdHash: varchar("jd_hash", { length: 64 }).notNull(),
    severity: varchar("severity", { length: 16 }).notNull().default("none"),
    missingMustHave: jsonb("missing_must_have").notNull().default(sql`'[]'::jsonb`),
    missingGoodToHave: jsonb("missing_good_to_have").notNull().default(sql`'[]'::jsonb`),
    answers: jsonb("answers").notNull().default(sql`'[]'::jsonb`),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: tcol("created_at"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    userHashIx: index("generation_preflights_user_hash_ix").on(t.userId, t.jdHash),
    expiresIx: index("generation_preflights_expires_ix").on(t.expiresAt),
  }),
);

export const contestLog = pgTable("contest_log", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  applicationId: uuid("application_id")
    .notNull()
    .references(() => applications.id, { onDelete: "cascade" }),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  reason: text("reason").notNull(),
  status: text("status").notNull().default("pending"),
  createdAt: tcol("created_at"),
});

export const abTestAssignments = pgTable(
  "ab_test_assignments",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    experimentId: text("experiment_id").notNull(),
    variant: text("variant").notNull(),
    createdAt: tcol("created_at"),
  },
  (t) => ({
    user_experiment_ix: index("ab_user_experiment_ix").on(t.userId, t.experimentId),
  }),
);

export const usageRecords = pgTable(
  "usage_records",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** generation | refinement | refinement_attempt */
    type: text("type").notNull(),
    applicationId: uuid("application_id").references(() => applications.id, {
      onDelete: "set null",
    }),
    tokenUsage: text("token_usage"),
    costUsd: doublePrecision("cost_usd"),
    createdAt: tcol("created_at"),
  },
  (t) => ({
    user_type_created_ix: index("usage_user_type_created_ix").on(
      t.userId,
      t.type,
      t.createdAt,
    ),
    user_app_type_created_ix: index("usage_user_app_type_created_ix").on(
      t.userId,
      t.applicationId,
      t.type,
      t.createdAt,
    ),
  }),
);

// ─────────────── Exports grouped for easy consumption ───────────────

export const pg_schema = {
  users,
  jd_clusters,
  jds,
  generations,
  blackboard_snapshots,
  audit_entries,
  conflicts,
  goals,
  active_questions,
  evidence_spans,
  voice_centroids,
  honesty_calibrations,
  emotional_states,
  emotional_state_corrections,
  mood_fingerprints,
  motivation_modulators,
  documents,
  applications,
  outcomes,
  gdpr_packets,
  case_base_entries,
  ontology_versions,
  // Legacy v1 product tables
  profiles,
  onboardingConversations,
  subscriptions,
  passwordResetTokens,
  processorConsents,
  generationPreflights,
  contestLog,
  abTestAssignments,
  usageRecords,
} as const;
export type PgSchema = typeof pg_schema;
