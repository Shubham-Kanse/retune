import { db, subscriptions, usageRecords } from "@retune/db";
import { and, count, eq, gte, sql } from "drizzle-orm";

// ─── Plan Configuration ─────────────────────────────────────────────────────
// Credits are integer tokens. Users see "500 credits" not "$5.00".
// 1 generation = 10 credits, 1 refinement = 1 credit.

export type PlanTier = "free" | "pro" | "max";

const PLAN_CREDITS: Record<PlanTier, number> = {
  free: Number(process.env.FREE_PLAN_CREDITS ?? 30),
  pro: Number(process.env.PRO_PLAN_CREDITS ?? 500),
  max: Number(process.env.MAX_PLAN_CREDITS ?? 1500),
};

const CREDIT_COSTS = {
  generation: Number(process.env.CREDIT_COST_GENERATION ?? 10),
  refinement: Number(process.env.CREDIT_COST_REFINEMENT ?? 1),
} as const;

const REFINEMENT_LIMITS: Record<PlanTier, number> = {
  free: 3,
  pro: 10,
  max: Infinity,
};

const REFINE_ATTEMPT_TYPE = "refinement_attempt";
const REFINE_ATTEMPT_WINDOW_MS = 10 * 60 * 1000;
const REFINE_ATTEMPT_LIMIT = 8;
const REFINE_ATTEMPT_BURST_WINDOW_MS = 60 * 1000;
const REFINE_ATTEMPT_BURST_LIMIT = 3;

// ─── Cache ──────────────────────────────────────────────────────────────────
const _cache = new Map<string, { value: unknown; expiresAt: number }>();

function cacheGet<T>(key: string): T | undefined {
  const entry = _cache.get(key);
  if (!entry) return undefined;
  if (Date.now() > entry.expiresAt) {
    _cache.delete(key);
    return undefined;
  }
  return entry.value as T;
}
function cacheSet(key: string, value: unknown, ttlMs: number): void {
  _cache.set(key, { value, expiresAt: Date.now() + ttlMs });
}
function cacheDel(key: string): void {
  _cache.delete(key);
}

// ─── Types ──────────────────────────────────────────────────────────────────
export interface UsageCheck {
  allowed: boolean;
  reason?: string;
  creditsRemaining?: number;
  creditsCost?: number;
  // Deprecated — kept for callers that haven't migrated yet
  remainingCreditsUsd?: number;
  costUsd?: number;
}

export interface SubscriptionInfo {
  plan: PlanTier;
  status: string;
  creditsUsed: number;
  creditsLimit: number;
  creditsRemaining: number;
  // Deprecated USD aliases (mapped from credits for backward compat)
  creditsUsedUsd: number;
  creditsLimitUsd: number;
  creditsRemainingUsd: number;
  generationsUsed: number;
  generationsLimit: number | null;
}

// ─── Helpers ────────────────────────────────────────────────────────────────
function getPlanCredits(plan: PlanTier): number {
  return PLAN_CREDITS[plan] ?? PLAN_CREDITS.free;
}

function getActionCost(type: "generation" | "refinement"): number {
  return CREDIT_COSTS[type];
}

async function getUsedCredits(userId: string): Promise<number> {
  const rows = await db
    .select({ total: sql<number>`COALESCE(SUM(${usageRecords.costUsd}), 0)` })
    .from(usageRecords)
    .where(and(eq(usageRecords.userId, userId), sql`${usageRecords.costUsd} IS NOT NULL`));
  return Math.round(Number(rows[0]?.total ?? 0));
}

// ─── Core API ───────────────────────────────────────────────────────────────
export async function getSubscription(userId: string): Promise<SubscriptionInfo> {
  const cacheKey = `subscription:${userId}`;
  const cached = cacheGet<SubscriptionInfo>(cacheKey);
  if (cached) return cached;

  const subRows = await db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.userId, userId))
    .limit(1);
  const sub = subRows[0];
  const plan = (sub?.plan ?? "free") as PlanTier;
  const creditsLimit = getPlanCredits(plan);
  const creditsUsed = await getUsedCredits(userId);
  const creditsRemaining = Math.max(creditsLimit - creditsUsed, 0);

  const result: SubscriptionInfo = {
    plan,
    status: sub?.status ?? "active",
    creditsUsed,
    creditsLimit,
    creditsRemaining,
    // Deprecated fields — map credits to pseudo-USD for backward compat
    creditsUsedUsd: creditsUsed / 10,
    creditsLimitUsd: creditsLimit / 10,
    creditsRemainingUsd: creditsRemaining / 10,
    generationsUsed: Math.floor(creditsUsed / CREDIT_COSTS.generation),
    generationsLimit: Math.floor(creditsLimit / CREDIT_COSTS.generation),
  };

  cacheSet(cacheKey, result, 60_000);
  return result;
}

export async function canGenerate(userId: string): Promise<UsageCheck> {
  const sub = await getSubscription(userId);
  const cost = getActionCost("generation");

  if (sub.creditsRemaining < cost) {
    return {
      allowed: false,
      reason: "insufficient_credits",
      creditsRemaining: sub.creditsRemaining,
      creditsCost: cost,
      remainingCreditsUsd: sub.creditsRemainingUsd,
      costUsd: cost / 10,
    };
  }

  return {
    allowed: true,
    creditsRemaining: sub.creditsRemaining - cost,
    creditsCost: cost,
    remainingCreditsUsd: (sub.creditsRemaining - cost) / 10,
    costUsd: cost / 10,
  };
}

export async function atomicCheckGeneration(
  userId: string,
  _applicationId: string,
): Promise<UsageCheck> {
  cacheDel(`subscription:${userId}`);

  return await db.transaction(async (tx) => {
    const subRows = await tx
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.userId, userId))
      .limit(1);
    const plan = (subRows[0]?.plan ?? "free") as PlanTier;
    const usageRows = await tx
      .select({ total: sql<number>`COALESCE(SUM(${usageRecords.costUsd}), 0)` })
      .from(usageRecords)
      .where(and(eq(usageRecords.userId, userId), sql`${usageRecords.costUsd} IS NOT NULL`));
    const creditsUsed = Math.round(Number(usageRows[0]?.total ?? 0));
    const creditsLimit = getPlanCredits(plan);
    const cost = getActionCost("generation");
    const creditsRemaining = Math.max(creditsLimit - creditsUsed, 0);

    if (creditsRemaining < cost) {
      return {
        allowed: false,
        reason: "insufficient_credits",
        creditsRemaining,
        creditsCost: cost,
        remainingCreditsUsd: creditsRemaining / 10,
        costUsd: cost / 10,
      };
    }

    return {
      allowed: true,
      creditsRemaining: creditsRemaining - cost,
      creditsCost: cost,
      remainingCreditsUsd: (creditsRemaining - cost) / 10,
      costUsd: cost / 10,
    };
  });
}

export async function canRefine(userId: string, applicationId: string): Promise<UsageCheck> {
  const sub = await getSubscription(userId);
  const cost = getActionCost("refinement");
  const limit = REFINEMENT_LIMITS[sub.plan];

  const usageRows = await db
    .select({ count: count() })
    .from(usageRecords)
    .where(
      and(
        eq(usageRecords.userId, userId),
        eq(usageRecords.type, "refinement"),
        eq(usageRecords.applicationId, applicationId),
      ),
    );

  const used = usageRows[0]?.count ?? 0;
  if (used >= limit) {
    return {
      allowed: false,
      reason: "refinement_limit_reached",
      creditsRemaining: 0,
      creditsCost: cost,
      remainingCreditsUsd: 0,
      costUsd: cost / 10,
    };
  }

  if (sub.creditsRemaining < cost) {
    return {
      allowed: false,
      reason: "insufficient_credits",
      creditsRemaining: sub.creditsRemaining,
      creditsCost: cost,
      remainingCreditsUsd: sub.creditsRemainingUsd,
      costUsd: cost / 10,
    };
  }

  return {
    allowed: true,
    creditsRemaining: sub.creditsRemaining - cost,
    creditsCost: cost,
    remainingCreditsUsd: (sub.creditsRemaining - cost) / 10,
    costUsd: cost / 10,
  };
}

export async function claimRefinementAttempt(
  userId: string,
  applicationId: string,
): Promise<UsageCheck> {
  const now = new Date();
  const windowStart = new Date(now.getTime() - REFINE_ATTEMPT_WINDOW_MS);
  const burstStart = new Date(now.getTime() - REFINE_ATTEMPT_BURST_WINDOW_MS);

  return await db.transaction(async (tx) => {
    const windowRows = await tx
      .select({ count: count() })
      .from(usageRecords)
      .where(
        and(
          eq(usageRecords.userId, userId),
          eq(usageRecords.applicationId, applicationId),
          eq(usageRecords.type, REFINE_ATTEMPT_TYPE),
          gte(usageRecords.createdAt, windowStart),
        ),
      );
    const burstRows = await tx
      .select({ count: count() })
      .from(usageRecords)
      .where(
        and(
          eq(usageRecords.userId, userId),
          eq(usageRecords.applicationId, applicationId),
          eq(usageRecords.type, REFINE_ATTEMPT_TYPE),
          gte(usageRecords.createdAt, burstStart),
        ),
      );

    const usedWindow = windowRows[0]?.count ?? 0;
    const usedBurst = burstRows[0]?.count ?? 0;

    if (usedWindow >= REFINE_ATTEMPT_LIMIT || usedBurst >= REFINE_ATTEMPT_BURST_LIMIT) {
      return { allowed: false, reason: "refinement_rate_limited", creditsRemaining: 0, remainingCreditsUsd: 0 };
    }

    await tx.insert(usageRecords).values({
      userId,
      type: REFINE_ATTEMPT_TYPE,
      applicationId,
    });

    return {
      allowed: true,
      creditsRemaining: Math.min(
        REFINE_ATTEMPT_LIMIT - usedWindow - 1,
        REFINE_ATTEMPT_BURST_LIMIT - usedBurst - 1,
      ),
      remainingCreditsUsd: 0,
    };
  });
}

export async function recordUsage(
  userId: string,
  type: "generation" | "refinement",
  applicationId?: string,
): Promise<void> {
  // Generation usage should be idempotent per application so retried completion
  // paths do not double-charge.
  if (type === "generation" && applicationId) {
    const existing = await db
      .select({ count: count() })
      .from(usageRecords)
      .where(
        and(
          eq(usageRecords.userId, userId),
          eq(usageRecords.type, "generation"),
          eq(usageRecords.applicationId, applicationId),
        ),
      );
    if ((existing[0]?.count ?? 0) > 0) {
      cacheDel(`subscription:${userId}`);
      return;
    }
  }

  const creditsCost = getActionCost(type);
  await db.insert(usageRecords).values({
    userId,
    type,
    applicationId: applicationId ?? null,
    costUsd: creditsCost, // DB column stores numeric credits (legacy name)
  });
  cacheDel(`subscription:${userId}`);
}

export async function upgradeToPro(userId: string): Promise<void> {
  await db
    .update(subscriptions)
    .set({ plan: "pro", status: "active", updatedAt: new Date() })
    .where(eq(subscriptions.userId, userId));
}

export async function upgradeToMax(userId: string): Promise<void> {
  await db
    .update(subscriptions)
    .set({ plan: "max", status: "active", updatedAt: new Date() })
    .where(eq(subscriptions.userId, userId));
}
