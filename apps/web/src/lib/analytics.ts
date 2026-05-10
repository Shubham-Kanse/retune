interface AnalyticsEvent {
  name: string;
  properties?: Record<string, any>;
  userId?: string;
  timestamp: number;
}

class Analytics {
  private events: AnalyticsEvent[] = [];
  private maxEvents = 1000;

  track(name: string, properties?: Record<string, any>, userId?: string): void {
    if (this.events.length >= this.maxEvents) {
      this.events.shift();
    }

    this.events.push({
      name,
      properties,
      userId,
      timestamp: Date.now(),
    });

    // Log in development
    if (process.env.NODE_ENV === "development") {
      console.log(`[Analytics] ${name}`, properties);
    }
  }

  page(path: string, userId?: string): void {
    this.track("page_view", { path }, userId);
  }

  identify(userId: string, traits?: Record<string, any>): void {
    this.track("identify", { userId, ...traits }, userId);
  }

  getEvents(userId?: string): AnalyticsEvent[] {
    return userId ? this.events.filter((e) => e.userId === userId) : this.events;
  }

  getEventCounts(): Record<string, number> {
    return this.events.reduce(
      (acc, event) => {
        acc[event.name] = (acc[event.name] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>,
    );
  }

  clear(): void {
    this.events = [];
  }
}

export const analytics = new Analytics();
