import fs from 'fs';
import path from 'path';
import { TranscodeErrorCallback } from './types';
import { TranscodeSession } from './session';
import { CACHE_DIR } from './config';

/** Singleton manager for the active transcoding session. Only one media file can transcode at a time. */
class TranscodeSessionManagerImpl {
  private currentSession: TranscodeSession | null = null;
  private errorCallbacks: TranscodeErrorCallback[] = [];

  startSession(mediaFileId: string, inputPath: string): TranscodeSession {
    this.stopSession();

    const outputDir = path.join(CACHE_DIR, mediaFileId);
    this.cleanDirectory(outputDir);

    const session = new TranscodeSession(mediaFileId, inputPath, outputDir);

    session.onError((resolution, error) => {
      for (const cb of this.errorCallbacks) {
        cb(resolution, error);
      }
    });

    this.currentSession = session;
    console.log(`[manager] Started new session for media ${mediaFileId}`);

    return session;
  }

  getSession(): TranscodeSession | null {
    return this.currentSession;
  }

  manageActiveCaches(currentPlayhead: number): void {
    if (this.currentSession) {
      this.currentSession.manageActiveCaches(currentPlayhead);
    }
  }

  stopSession(): void {
    if (this.currentSession) {
      console.log(`[manager] Stopping session for media ${this.currentSession.mediaFileId}`);
      this.currentSession.stop();
      this.currentSession = null;
    }
  }

  onError(callback: TranscodeErrorCallback): void {
    this.errorCallbacks.push(callback);
  }

  private cleanDirectory(dir: string): void {
    try {
      if (fs.existsSync(dir)) {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    } catch (err) {
      console.error(`[manager] Failed to clean directory ${dir}:`, err);
    }
  }
}

export const TranscodeSessionManager = new TranscodeSessionManagerImpl();
