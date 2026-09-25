import path from 'path';
import { TranscodeErrorCallback, AudioTrackDescriptor } from '../types';
import { TranscodeSession } from './session';
import { CACHE_DIR as DEFAULT_CACHE_DIR } from '../config/config';
import { TranscodeCache } from '../fs/cache';

/** Manager for active transcoding sessions. Manages one sync session and isolated async sessions. */
class TranscodeSessionManagerClass {
  private sessions = new Map<string, TranscodeSession>();
  private errorCallbacks: TranscodeErrorCallback[] = [];
  private baseCacheDir = DEFAULT_CACHE_DIR;

  getCacheDir(): string {
    return this.baseCacheDir;
  }

  startSession(sessionId: string, mediaFileId: string, inputPath: string, audioTracks: AudioTrackDescriptor[] = []): TranscodeSession {
    this.stopSession(sessionId);

    // Isolate cache directory per session, media, and run to prevent directory deletion race conditions.
    const uniqueRunId = Math.random().toString(36).substring(2, 10);
    const outputDir = path.join(this.baseCacheDir, sessionId, mediaFileId, uniqueRunId);
    TranscodeCache.cleanDirectory(outputDir);

    const session = new TranscodeSession(sessionId, mediaFileId, inputPath, outputDir, audioTracks);

    session.onError((resolution, error) => {
      for (const cb of this.errorCallbacks) {
        cb(resolution, error);
      }
    });

    this.sessions.set(sessionId, session);
    console.log(`[transcode] Started new session ${sessionId} for media ${mediaFileId}`);

    return session;
  }

  getSession(sessionId: string): TranscodeSession | null {
    return this.sessions.get(sessionId) || null;
  }

  async stopSession(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) return;
    console.log(`[transcode] Stopping session ${sessionId} for media ${session.mediaFileId}`);
    this.sessions.delete(sessionId);
    await session.stop();
  }

  async stopAll(): Promise<void> {
    await Promise.all([...this.sessions.keys()].map(sessionId => this.stopSession(sessionId)));
  }

  onError(callback: TranscodeErrorCallback): void {
    this.errorCallbacks.push(callback);
  }
}


export const TranscodeSessionManager = new TranscodeSessionManagerClass();
