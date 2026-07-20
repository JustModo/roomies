import { SCAN_CONCURRENCY } from './config';

export const runWithConcurrency = async <T>(items: T[], worker: (item: T) => Promise<void>): Promise<void> => {
  let cursor = 0;
  const runNext = async (): Promise<void> => {
    while (cursor < items.length) {
      const item = items[cursor++];
      await worker(item);
    }
  };
  await Promise.all(Array.from({ length: Math.min(SCAN_CONCURRENCY, items.length) }, runNext));
};
