import { SCAN_CONCURRENCY, PROBE_CONCURRENCY } from './config';

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

let activeProbes = 0;
const probeQueue: (() => void)[] = [];

export const withProbeLimit = async <T>(fn: () => Promise<T>): Promise<T> => {
  if (activeProbes >= PROBE_CONCURRENCY) {
    await new Promise<void>((resolve) => probeQueue.push(resolve));
  }
  activeProbes++;
  try {
    return await fn();
  } finally {
    activeProbes--;
    const next = probeQueue.shift();
    if (next) next();
  }
};
