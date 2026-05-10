interface RateLimitStore {
  count: number;
  resetAt: number;
}

const store = new Map<string, RateLimitStore>();

export function checkRateLimit(
  userId: string,
  endpoint: string,
  maxRequests = 10,
  windowMs = 60000, // 1 minute
): { allowed: boolean; remaining: number; resetAt: number } {
  const key = `${userId}:${endpoint}`;
  const now = Date.now();
  let bucket = store.get(key);

  if (!bucket || now > bucket.resetAt) {
    bucket = {
      count: 1,
      resetAt: now + windowMs,
    };
    store.set(key, bucket);
    return {
      allowed: true,
      remaining: maxRequests - 1,
      resetAt: bucket.resetAt,
    };
  }

  bucket.count += 1;
  const allowed = bucket.count <= maxRequests;

  return {
    allowed,
    remaining: Math.max(0, maxRequests - bucket.count),
    resetAt: bucket.resetAt,
  };
}

// Cleanup old entries every 5 minutes
setInterval(
  () => {
    const now = Date.now();
    for (const [key, bucket] of store.entries()) {
      if (now > bucket.resetAt) {
        store.delete(key);
      }
    }
  },
  5 * 60 * 1000,
);
