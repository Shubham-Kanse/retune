interface PerformanceMetric {
  name: string;
  duration: number;
  timestamp: number;
  metadata?: Record<string, any>;
}

class PerformanceMonitor {
  private metrics: PerformanceMetric[] = [];
  private maxMetrics = 1000;

  startTimer(name: string): () => void {
    const start = performance.now();
    return (metadata?: Record<string, any>) => {
      this.recordMetric(name, performance.now() - start, metadata);
    };
  }

  recordMetric(name: string, duration: number, metadata?: Record<string, any>): void {
    if (this.metrics.length >= this.maxMetrics) {
      this.metrics.shift();
    }

    this.metrics.push({
      name,
      duration,
      timestamp: Date.now(),
      metadata,
    });

    // Log slow operations
    if (duration > 1000) {
      console.warn(`Slow operation: ${name} took ${duration.toFixed(2)}ms`, metadata);
    }
  }

  getMetrics(name?: string): PerformanceMetric[] {
    return name ? this.metrics.filter((m) => m.name === name) : this.metrics;
  }

  getAverageTime(name: string): number {
    const metrics = this.getMetrics(name);
    if (metrics.length === 0) return 0;
    return metrics.reduce((sum, m) => sum + m.duration, 0) / metrics.length;
  }

  clear(): void {
    this.metrics = [];
  }
}

export const perf = new PerformanceMonitor();
