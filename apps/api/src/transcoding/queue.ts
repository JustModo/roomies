import { EventEmitter } from 'events';

// Job data shape — fully typed
export interface TranscodeJobData {
  partyId: string;
  inputPath: string;
  outputDir: string;
}

export interface TranscodeJob {
  id: string;
  data: TranscodeJobData;
  attemptsMade: number;
}

interface AddJobOptions {
  jobId: string;
}

const CONCURRENCY = 2; // max 2 simultaneous transcode jobs
const MAX_ATTEMPTS = 2;
const BACKOFF_BASE_MS = 3000; // exponential backoff, matching the old BullMQ config

/**
 * Single-node, in-process replacement for the BullMQ `transcodeQueue`. Since
 * this app only ever runs as one Node process (no horizontal scaling), an
 * external broker (Redis) isn't needed — an array-backed queue with a
 * concurrency-limited worker loop provides the same guarantees this app
 * actually relies on: jobId dedup, retry-with-backoff, and a bounded number
 * of concurrent ffmpeg processes.
 *
 * Emits 'completed' (job) and 'failed' (job, err), matching the subset of the
 * BullMQ Worker event API that bootstrap/index.ts consumes.
 */
class InProcessTranscodeQueue extends EventEmitter {
  private pending: TranscodeJob[] = [];
  private activeJobIds = new Set<string>();
  // Tracks jobIds that are queued, running, or awaiting a retry — used for
  // the same idempotency guarantee `jobId: partyId` provided under BullMQ.
  private knownJobIds = new Set<string>();
  private processor: ((job: TranscodeJob) => Promise<void>) | null = null;

  setProcessor(fn: (job: TranscodeJob) => Promise<void>) {
    this.processor = fn;
    this.drain();
  }

  async add(_name: string, data: TranscodeJobData, opts: AddJobOptions): Promise<void> {
    if (this.knownJobIds.has(opts.jobId)) return;

    this.knownJobIds.add(opts.jobId);
    this.pending.push({ id: opts.jobId, data, attemptsMade: 0 });
    this.drain();
  }

  private drain() {
    if (!this.processor) return;
    while (this.activeJobIds.size < CONCURRENCY && this.pending.length > 0) {
      const job = this.pending.shift()!;
      // Fire-and-forget: runJob never rejects (see try/catch below), but a
      // defensive .catch() is kept here so a future change to runJob can't
      // turn this into an unhandled promise rejection that crashes the process.
      this.runJob(job).catch((err) => {
        this.emitSafely('failed', job, err);
      });
    }
  }

  // Listener exceptions must never crash the process or be mistaken for a
  // job failure — isolate each emit() so a broken listener only logs, here
  // via a last-resort console.error since there's no logger at this layer.
  private emitSafely(event: 'completed' | 'failed', ...args: unknown[]) {
    try {
      this.emit(event, ...args);
    } catch (err) {
      console.error(`Unhandled error in '${event}' listener`, err);
    }
  }

  private async runJob(job: TranscodeJob) {
    this.activeJobIds.add(job.id);
    try {
      await this.processor!(job);
      this.knownJobIds.delete(job.id);
      this.emitSafely('completed', job);
    } catch (err) {
      job.attemptsMade += 1;
      if (job.attemptsMade < MAX_ATTEMPTS) {
        const delay = BACKOFF_BASE_MS * 2 ** (job.attemptsMade - 1);
        const timer = setTimeout(() => {
          this.pending.push(job);
          this.drain();
        }, delay);
        timer.unref();
      } else {
        this.knownJobIds.delete(job.id);
        this.emitSafely('failed', job, err);
      }
    } finally {
      this.activeJobIds.delete(job.id);
      this.drain();
    }
  }
}

export const transcodeQueue = new InProcessTranscodeQueue();
