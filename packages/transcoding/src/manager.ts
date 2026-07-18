import path from 'path';
import { TranscodeErrorCallback } from './types';
import { TranscodeSession } from './session';
import { CACHE_DIR } from './config';
import { TranscodeCache } from './cache';

/** Singleton manager for active transcoding sessions. Manages one sync session and isolated async sessions. */
class TranscodeSessionManagerImpl {
  private sessions = new Map<string, TranscodeSession>();
  private errorCallbacks: TranscodeErrorCallback[] = [];

  startSession(sessionId: string, mediaFileId: string, inputPath: string): TranscodeSession {
    this.stopSession(sessionId);

    // Isolate cache directory per session, media, and run (uniqueId)
    // to prevent race conditions where a stopping session deletes the directory of a new session.
    const uniqueRunId = Math.random().toString(36).substring(2, 10);
    const outputDir = path.join(CACHE_DIR, sessionId, mediaFileId, uniqueRunId);
    TranscodeCache.cleanDirectory(outputDir);

    const session = new TranscodeSession(sessionId, mediaFileId, inputPath, outputDir);

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



  stopSession(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      console.log(`[transcode] Stopping session ${sessionId} for media ${session.mediaFileId}`);
      session.stop();
      this.sessions.delete(sessionId);
    }
  }

  stopAll(): void {
    for (const sessionId of this.sessions.keys()) {
      this.stopSession(sessionId);
    }
  }

  onError(callback: TranscodeErrorCallback): void {
    this.errorCallbacks.push(callback);
  }
}

export const TranscodeSessionManager = new TranscodeSessionManagerImpl();
