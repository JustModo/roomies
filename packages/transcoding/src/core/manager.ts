import { randomUUID } from 'crypto';
import path from 'path';
import type { Logger } from '@roomies/config';
import type { TranscodeOptions } from '../config/options';
import { EncoderBackend } from '../ffmpeg/hwaccel';
import { emptyDirectory, removeDirectory } from '../fs/cache';
import { AudioTrackDescriptor } from '../types';
import { TranscodeDeps, WorkerSlots } from './deps';
import { TranscodeSession } from './session';

const PARK_TTL_MS = 30 * 60 * 1000;

/**
 * Entry point of the transcoding pipeline: owns the encoder backend, the worker cap and the
 * active sessions (one per session id — 'sync' for the room, 'async' for independent viewers).
 */
export class TranscodeSessionManager {
  readonly encoder: EncoderBackend;
  private readonly deps: TranscodeDeps;
  private sessions = new Map<string, TranscodeSession>();
  private parked: { session: TranscodeSession; timer: NodeJS.Timeout } | null = null;

  constructor(
    readonly options: TranscodeOptions,
    private readonly log: Logger,
  ) {
    this.encoder = new EncoderBackend(options.ffmpegPath, log);
    this.deps = {
      options,
      encoder: this.encoder,
      slots: new WorkerSlots(options.maxConcurrentWorkers),
      log,
      evictIdleGroup: () => this.evictIdleGroup(),
    };
  }

  startSession(sessionId: string, mediaFileId: string, inputPath: string, audioTracks: AudioTrackDescriptor[] = []): TranscodeSession {
    const revived = this.unpark(sessionId, mediaFileId);
    this.retire(sessionId);
    if (revived) {
      this.sessions.set(sessionId, revived);
      this.log.info({ sessionId, mediaFileId }, 'Revived parked transcode session');
      return revived;
    }

    // Isolate cache directory per session, media, and run to prevent directory deletion race conditions.
    const outputDir = path.join(this.options.cacheDir, sessionId, mediaFileId, randomUUID().slice(0, 8));
    removeDirectory(outputDir, this.log);

    const session = new TranscodeSession(this.deps, { sessionId, mediaFileId, inputPath, outputDir, audioTracks });
    this.sessions.set(sessionId, session);
    this.log.info({ sessionId, mediaFileId }, 'Started transcode session');
    return session;
  }

  getSession(sessionId: string): TranscodeSession | null {
    return this.sessions.get(sessionId) ?? null;
  }

  async stopSession(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) return;
    this.log.info({ sessionId, mediaFileId: session.mediaFileId }, 'Stopping transcode session');
    this.sessions.delete(sessionId);
    await session.stop();
  }

  async stopAll(): Promise<void> {
    await Promise.all([...[...this.sessions.keys()].map((sessionId) => this.stopSession(sessionId)), this.stopParked()]);
  }

  /** Wipes transcode output left over from a previous run. */
  clearCache(): void {
    emptyDirectory(this.options.cacheDir, this.log);
    this.log.info('Cleaned transcode cache directory');
  }

  private unpark(sessionId: string, mediaFileId: string): TranscodeSession | null {
    if (sessionId !== 'sync' || this.parked?.session.mediaFileId !== mediaFileId) return null;
    const { session, timer } = this.parked;
    clearTimeout(timer);
    this.parked = null;
    return session;
  }

  private retire(sessionId: string): void {
    const current = this.sessions.get(sessionId);
    if (!current || sessionId !== 'sync') {
      void this.stopSession(sessionId);
      return;
    }
    this.sessions.delete(sessionId);
    void this.stopParked();
    current.park();
    this.parked = { session: current, timer: setTimeout(() => void this.stopParked(), PARK_TTL_MS) };
    this.log.info({ sessionId, mediaFileId: current.mediaFileId }, 'Parked transcode session');
  }

  private async stopParked(): Promise<void> {
    if (!this.parked) return;
    const { session, timer } = this.parked;
    clearTimeout(timer);
    this.parked = null;
    await session.stop();
  }

  private async evictIdleGroup(): Promise<boolean> {
    const sessions = [...this.sessions.values(), ...(this.parked ? [this.parked.session] : [])];
    const candidates = sessions.flatMap((session) => session.idleGroups().map((group) => ({ session, ...group })));
    if (candidates.length === 0) return false;
    const oldest = candidates.reduce((a, b) => (b.createdAt < a.createdAt ? b : a));
    this.log.info({ sessionId: oldest.session.sessionId, offset: oldest.offset }, 'Evicting idle offset group to free a worker slot');
    await oldest.session.stopGroup(oldest.offset);
    return true;
  }
}
