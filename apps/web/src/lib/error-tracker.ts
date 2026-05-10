interface ErrorReport {
  id: string;
  message: string;
  stack?: string;
  url: string;
  userAgent: string;
  userId?: string;
  timestamp: number;
  context?: Record<string, any>;
}

class ErrorTracker {
  private errors: ErrorReport[] = [];
  private maxErrors = 500;

  track(error: Error, context?: Record<string, any>): string {
    const id = Math.random().toString(36).substring(2, 15);

    if (this.errors.length >= this.maxErrors) {
      this.errors.shift();
    }

    const report: ErrorReport = {
      id,
      message: error.message,
      stack: error.stack,
      url: typeof window !== "undefined" ? window.location.href : "server",
      userAgent: typeof navigator !== "undefined" ? navigator.userAgent : "server",
      timestamp: Date.now(),
      context,
    };

    this.errors.push(report);

    // Log to console in development
    if (process.env.NODE_ENV === "development") {
      console.error(`[ErrorTracker:${id}]`, error, context);
    }

    return id;
  }

  getErrors(limit = 50): ErrorReport[] {
    return this.errors.slice(-limit);
  }

  getError(id: string): ErrorReport | undefined {
    return this.errors.find((e) => e.id === id);
  }

  clear(): void {
    this.errors = [];
  }
}

export const errorTracker = new ErrorTracker();

// Global error handler for unhandled promises
if (typeof window !== "undefined") {
  window.addEventListener("unhandledrejection", (event) => {
    errorTracker.track(new Error(event.reason), { type: "unhandledrejection" });
  });
}
