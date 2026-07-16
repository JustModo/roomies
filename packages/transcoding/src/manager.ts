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

    // Isolate cache directory per session and media
    const outputDir = path.join(CACHE_DIR, sessionId, mediaFileId);
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

  manageActiveCaches(sessionPlayheads: Record<string, { activeOffsets: Set<number>, playheads: { position: number, resolution?: string }[] }>): void {
    for (const [sessionId, session] of this.sessions.entries()) {
      const data = sessionPlayheads[sessionId];
      if (data) {
        session.manageActiveCaches(data.activeOffsets, data.playheads);
      } else {
        // If session is no longer active (user left or switched), stop it.
        this.stopSession(sessionId);
      }
    }
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
