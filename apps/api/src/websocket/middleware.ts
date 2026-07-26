/** Creates a sliding-window rate limiter for WebSocket message handlers. */
export const createRateLimiter = (windowMs: number, maxMessages: number) => {
  let windowStart = Date.now();
  let messagesInWindow = 0;

  return (next: (message: string) => Promise<void> | void) => {
    return async (message: string) => {
      const now = Date.now();
      
      if (now - windowStart > windowMs) {
        windowStart = now;
        messagesInWindow = 0;
      }
      
      messagesInWindow += 1;
      
      if (messagesInWindow > maxMessages) {
        return;
      }
      
      return next(message);
    };
  };
};

import { SocketEventHandler } from './router';

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

/**
 * Creates a global debouncer (leading-edge throttle) for socket events.
 * If multiple users trigger the same wrapped event within delayMs, only the first one executes.
 */
export const createDebouncer = (delayMs: number) => {
  let lastExecutedTime = 0;
  
  return (next: SocketEventHandler): SocketEventHandler => {
    return async (payload, ctx) => {
      const now = Date.now();
      if (now - lastExecutedTime < delayMs) {
        return; // Ignore duplicated events within the delay window
      }
      lastExecutedTime = now;
      return next(payload, ctx);
    };
  };
};
