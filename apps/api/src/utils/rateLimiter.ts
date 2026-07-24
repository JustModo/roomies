/**
 * Token bucket rate limiter for per-user action limiting.
 * Clean, reusable implementation.
 */

export interface RateLimitConfig {
  /** Maximum burst tokens allowed */
  maxTokens: number;
  /** Tokens added per millisecond (e.g., 1/500 = 1 token per 500ms) */
  refillRatePerMs: number;
}

interface Bucket {
  tokens: number;
  lastRefill: number;
}

const buckets = new Map<string, Bucket>();

/**
 * Checks if an action is allowed under rate limits.
 * @param key Unique identifier (e.g., userId, IP)
 * @param config Rate limit configuration
 * @returns true if allowed, false if rate limited
 */
export function checkRateLimit(key: string, config: RateLimitConfig): boolean {
  const now = Date.now();
  const bucket = buckets.get(key) ?? { tokens: config.maxTokens, lastRefill: now };

  // Refill tokens based on elapsed time
  const elapsed = now - bucket.lastRefill;
  const refill = elapsed * config.refillRatePerMs;
  bucket.tokens = Math.min(config.maxTokens, bucket.tokens + refill);
  bucket.lastRefill = now;

  if (bucket.tokens >= 1) {
    bucket.tokens -= 1;
    buckets.set(key, bucket);
    return true;
  }

  buckets.set(key, bucket);
  return false;
}

/**
 * Resets the rate limit for a specific key.
 */
export function resetRateLimit(key: string): void {
  buckets.delete(key);
}

/**
 * Starts periodic cleanup of stale buckets.
 * @param intervalMs Cleanup interval (default: 5 minutes)
 * @param maxAgeMs Maximum age before bucket is considered stale (default: 5 minutes)
 */
export function startCleanupInterval(intervalMs = 5 * 60 * 1000, maxAgeMs = 5 * 60 * 1000): void {
  setInterval(() => {
    const now = Date.now();
    for (const [key, bucket] of buckets.entries()) {
      if (now - bucket.lastRefill > maxAgeMs) {
        buckets.delete(key);
      }
    }
  }, intervalMs);
}