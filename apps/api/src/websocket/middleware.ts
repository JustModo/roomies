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
