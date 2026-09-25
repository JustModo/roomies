/**
 * Fixed-window counter, optionally keyed (per IP, per user). Expired windows are
 * swept on each call so the map stays bounded without a timer.
 */
export class RateLimiter {
  private windows = new Map<string, { count: number; resetAt: number }>();

  constructor(
    private readonly windowMs: number,
    private readonly max: number,
  ) {}

  /** Counts one hit for key and returns true while it is within the limit. */
  allow(key = ''): boolean {
    const now = Date.now();
    for (const [k, window] of this.windows) {
      if (window.resetAt <= now) this.windows.delete(k);
    }

    const window = this.windows.get(key) ?? { count: 0, resetAt: now + this.windowMs };
    window.count += 1;
    this.windows.set(key, window);
    return window.count <= this.max;
  }

  reset(key = ''): void {
    this.windows.delete(key);
  }
}
