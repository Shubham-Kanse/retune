interface FeatureFlag {
  key: string;
  name: string;
  description: string;
  enabled: boolean;
  rolloutPercentage: number;
  conditions?: {
    userIds?: string[];
    userAttributes?: Record<string, any>;
    dateRange?: { start: Date; end: Date };
  };
  variants?: Record<string, any>;
}

interface FeatureFlagContext {
  userId?: string;
  userAttributes?: Record<string, any>;
  timestamp?: number;
}

class FeatureFlagManager {
  private flags = new Map<string, FeatureFlag>();
  private userAssignments = new Map<string, Record<string, boolean | string>>();

  createFlag(flag: FeatureFlag): void {
    this.flags.set(flag.key, flag);
  }

  isEnabled(flagKey: string, context: FeatureFlagContext = {}): boolean {
    const flag = this.flags.get(flagKey);
    if (!flag) return false;

    // Check if flag is globally disabled
    if (!flag.enabled) return false;

    // Check date range conditions
    if (flag.conditions?.dateRange) {
      const now = new Date(context.timestamp || Date.now());
      const { start, end } = flag.conditions.dateRange;
      if (now < start || now > end) return false;
    }

    // Check user ID whitelist
    if (flag.conditions?.userIds && context.userId) {
      if (flag.conditions.userIds.includes(context.userId)) return true;
    }

    // Check user attributes
    if (flag.conditions?.userAttributes && context.userAttributes) {
      const matches = Object.entries(flag.conditions.userAttributes).every(
        ([key, value]) => context.userAttributes![key] === value,
      );
      if (!matches) return false;
    }

    // Check rollout percentage
    if (context.userId) {
      const hash = this.hashUserId(context.userId, flagKey);
      return hash < flag.rolloutPercentage / 100;
    }

    // Default to rollout percentage for anonymous users
    return Math.random() < flag.rolloutPercentage / 100;
  }

  getVariant(flagKey: string, context: FeatureFlagContext = {}): string | null {
    const flag = this.flags.get(flagKey);
    if (!flag || !flag.variants || !this.isEnabled(flagKey, context)) {
      return null;
    }

    const variants = Object.keys(flag.variants);
    if (variants.length === 0) return null;

    if (context.userId) {
      const hash = this.hashUserId(context.userId, `${flagKey}_variant`);
      const index = Math.floor(hash * variants.length);
      return variants[index] ?? null;
    }

    // Random variant for anonymous users
    return variants[Math.floor(Math.random() * variants.length)] ?? null;
  }

  getAllFlags(): FeatureFlag[] {
    return Array.from(this.flags.values());
  }

  updateFlag(flagKey: string, updates: Partial<FeatureFlag>): boolean {
    const flag = this.flags.get(flagKey);
    if (!flag) return false;

    this.flags.set(flagKey, { ...flag, ...updates });
    return true;
  }

  deleteFlag(flagKey: string): boolean {
    return this.flags.delete(flagKey);
  }

  private hashUserId(userId: string, salt: string): number {
    let hash = 0;
    const str = userId + salt;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash;
    }
    return Math.abs(hash) / 2147483647;
  }

  // Analytics methods
  getFlagUsage(flagKey: string): {
    enabled: number;
    disabled: number;
    variants: Record<string, number>;
  } {
    // In a real implementation, this would query usage analytics
    return {
      enabled: 0,
      disabled: 0,
      variants: {},
    };
  }

  exportFlags(): string {
    return JSON.stringify(Array.from(this.flags.values()), null, 2);
  }

  importFlags(flagsJson: string): void {
    try {
      const flags: FeatureFlag[] = JSON.parse(flagsJson);
      for (const flag of flags) {
        this.flags.set(flag.key, flag);
      }
    } catch (error) {
      throw new Error("Invalid flags JSON format");
    }
  }
}

export const featureFlags = new FeatureFlagManager();

// Initialize default flags
featureFlags.createFlag({
  key: "ai_suggestions",
  name: "AI Content Suggestions",
  description: "Show AI-powered content improvement suggestions",
  enabled: true,
  rolloutPercentage: 50,
});

featureFlags.createFlag({
  key: "collaboration_mode",
  name: "Real-time Collaboration",
  description: "Enable real-time collaborative editing",
  enabled: false,
  rolloutPercentage: 10,
  conditions: {
    userAttributes: { plan: "pro" },
  },
});

featureFlags.createFlag({
  key: "advanced_analytics",
  name: "Advanced Analytics Dashboard",
  description: "Show detailed analytics and insights",
  enabled: true,
  rolloutPercentage: 100,
  conditions: {
    userAttributes: { role: "admin" },
  },
});

featureFlags.createFlag({
  key: "semantic_search",
  name: "Semantic Search",
  description: "AI-powered semantic search across applications",
  enabled: true,
  rolloutPercentage: 75,
});

featureFlags.createFlag({
  key: "ml_ats_optimization",
  name: "ML ATS Optimization",
  description: "Machine learning-based ATS score optimization",
  enabled: true,
  rolloutPercentage: 80,
});

// React hook for feature flags
export function useFeatureFlag(flagKey: string, context: FeatureFlagContext = {}) {
  return featureFlags.isEnabled(flagKey, context);
}

export function useFeatureVariant(flagKey: string, context: FeatureFlagContext = {}) {
  return featureFlags.getVariant(flagKey, context);
}
