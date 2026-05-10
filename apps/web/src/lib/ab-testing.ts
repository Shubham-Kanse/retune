import { db } from "@retune/db";
import { abTestAssignments } from "@retune/db/schema";
import { and, eq } from "drizzle-orm";

interface Experiment {
  id: string;
  name: string;
  variants: Record<string, any>;
  traffic: number; // 0-1
  active: boolean;
  startDate: Date;
  endDate?: Date;
}

class ABTestingFramework {
  private experiments = new Map<string, Experiment>();

  createExperiment(experiment: Experiment): void {
    this.experiments.set(experiment.id, experiment);
  }

  async getVariant(experimentId: string, userId: string): Promise<string | null> {
    const experiment = this.experiments.get(experimentId);
    if (!experiment || !experiment.active) return null;

    // Check DB for existing assignment
    try {
      const existing = await db
        .select({ variant: abTestAssignments.variant })
        .from(abTestAssignments)
        .where(
          and(
            eq(abTestAssignments.userId, userId),
            eq(abTestAssignments.experimentId, experimentId),
          ),
        )
        .limit(1);
      if (existing[0]) return existing[0].variant;
    } catch {
      // DB unavailable — fall through to in-memory hash assignment
    }

    // Check traffic allocation
    const hash = this.hashUserId(userId, experimentId);
    if (hash > experiment.traffic) return null;

    // Assign variant deterministically
    const variants = Object.keys(experiment.variants);
    const variantIndex = Math.floor((hash * variants.length) / experiment.traffic);
    const variant = variants[variantIndex] || "control";

    // Persist assignment
    try {
      await db.insert(abTestAssignments).values({
        userId,
        experimentId,
        variant,
      });
    } catch {
      // Non-fatal — assignment still returned
    }

    return variant;
  }

  trackConversion(_experimentId: string, _userId: string, _event: string): void {
    // Conversion tracking is recorded via usage_records; no separate table needed.
  }

  async getResults(experimentId: string): Promise<Record<string, number>> {
    try {
      const rows = await db
        .select({ variant: abTestAssignments.variant })
        .from(abTestAssignments)
        .where(eq(abTestAssignments.experimentId, experimentId));
      const counts: Record<string, number> = {};
      for (const row of rows) {
        counts[row.variant] = (counts[row.variant] ?? 0) + 1;
      }
      return counts;
    } catch {
      return {};
    }
  }

  private hashUserId(userId: string, experimentId: string): number {
    let hash = 0;
    const str = userId + experimentId;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash;
    }
    return Math.abs(hash) / 2147483647;
  }

  listExperiments(): Experiment[] {
    return Array.from(this.experiments.values());
  }

  stopExperiment(experimentId: string): void {
    const experiment = this.experiments.get(experimentId);
    if (experiment) {
      experiment.active = false;
      experiment.endDate = new Date();
    }
  }
}

export const abTesting = new ABTestingFramework();

// Initialize some experiments
abTesting.createExperiment({
  id: "landing-cta",
  name: "Landing Page CTA Test",
  variants: {
    control: { text: "Generate Resume", color: "primary" },
    variant1: { text: "Create My Resume", color: "accent" },
    variant2: { text: "Build Resume Now", color: "primary" },
  },
  traffic: 0.5,
  active: true,
  startDate: new Date(),
});

abTesting.createExperiment({
  id: "onboarding-flow",
  name: "Onboarding Flow Test",
  variants: {
    control: { steps: 3, skipAllowed: true },
    variant1: { steps: 2, skipAllowed: false },
  },
  traffic: 0.3,
  active: true,
  startDate: new Date(),
});
