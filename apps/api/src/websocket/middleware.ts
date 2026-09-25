/** Creates a sliding-window rate limiter for WebSocket messages. Returns true while under the limit. */
export const createRateLimiter = (windowMs: number, maxMessages: number) => {
  let windowStart = Date.now();
  let messagesInWindow = 0;

  return (): boolean => {
    const now = Date.now();

    if (now - windowStart > windowMs) {
      windowStart = now;
      messagesInWindow = 0;
    }

    messagesInWindow += 1;

    return messagesInWindow <= maxMessages;
  };
};

// Simple per-key rate limiter: checks if key has been used in the last `windowMs`
// Returns true if allowed (first call or window expired), false if rate limited
const rateLimitStore = new Map<string, number>();

export const checkRateLimit = (key: string, windowMs: number): boolean => {
  const now = Date.now();
  const lastUsed = rateLimitStore.get(key);

  if (lastUsed && now - lastUsed < windowMs) {
    return false; // Rate limited
  }

  rateLimitStore.set(key, now);
  return true; // Allowed
};
