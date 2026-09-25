/** Runs worker over items with at most `limit` in flight. */
export const runWithConcurrency = async <T>(items: T[], limit: number, worker: (item: T) => Promise<void>): Promise<void> => {
  let cursor = 0;
  const runNext = async (): Promise<void> => {
    while (cursor < items.length) await worker(items[cursor++]);
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, runNext));
};

/** Caps how many tasks run at once; excess callers queue in FIFO order. */
export class ConcurrencyLimiter {
  private active = 0;
  private queue: (() => void)[] = [];

  constructor(private readonly max: number) {}

  async run<T>(task: () => Promise<T>): Promise<T> {
    if (this.active >= this.max) await new Promise<void>((resolve) => this.queue.push(resolve));
    this.active++;
    try {
      return await task();
    } finally {
      this.active--;
      this.queue.shift()?.();
    }
  }
}
