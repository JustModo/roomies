import { randomUUID } from 'crypto';
import path from 'path';
import type { Logger } from '@roomies/config';
import type { TranscodeOptions } from '../config/options';
import { EncoderBackend } from '../ffmpeg/hwaccel';
import { emptyDirectory, removeDirectory } from '../fs/cache';
import { AudioTrackDescriptor, TranscodeErrorCallback } from '../types';
import { TranscodeDeps, WorkerSlots } from './deps';
import { TranscodeSession } from './session';

/**
 * Entry point of the transcoding pipeline: owns the encoder backend, the worker cap and the
 * active sessions (one per session id — 'sync' for the room, 'async' for independent viewers).
 */
export class TranscodeSessionManager {
  readonly encoder: EncoderBackend;
  private readonly deps: TranscodeDeps;
  private sessions = new Map<string, TranscodeSession>();
  private errorCallbacks: TranscodeErrorCallback[] = [];

  constructor(
    readonly options: TranscodeOptions,
    private readonly log: Logger,
  ) {
    this.encoder = new EncoderBackend(options.ffmpegPath, log);
    this.deps = { options, encoder: this.encoder, slots: new WorkerSlots(options.maxConcurrentWorkers), log };
  }

  startSession(sessionId: string, mediaFileId: string, inputPath: string, audioTracks: AudioTrackDescriptor[] = []): TranscodeSession {
    void this.stopSession(sessionId);

    // Isolate cache directory per session, media, and run to prevent directory deletion race conditions.
    const outputDir = path.join(this.options.cacheDir, sessionId, mediaFileId, randomUUID().slice(0, 8));
    removeDirectory(outputDir, this.log);

    const session = new TranscodeSession(this.deps, { sessionId, mediaFileId, inputPath, outputDir, audioTracks });
    session.onError((resolution, error) => this.errorCallbacks.forEach((cb) => cb(resolution, error)));
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
    await Promise.all([...this.sessions.keys()].map((sessionId) => this.stopSession(sessionId)));
  }

  /** Wipes transcode output left over from a previous run. */
  clearCache(): void {
    emptyDirectory(this.options.cacheDir, this.log);
    this.log.info('Cleaned transcode cache directory');
  }

  onError(callback: TranscodeErrorCallback): void {
    this.errorCallbacks.push(callback);
  }
}
