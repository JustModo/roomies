import fs from 'fs';
import path from 'path';
import { TranscodeErrorCallback } from './types';
import { TranscodeSession } from './session';
import { CACHE_DIR } from './config';

/**
 * Singleton manager for the active transcoding session.
 *
 * Only one media file can be actively transcoding at a time (matching the
 * single-room model). When a new media file is selected, the old session
 * is stopped and its FFmpeg processes are killed.
 *
 * This class has no knowledge of "the room" or "the current playhead" — the
 * consuming app is responsible for calling `manageActiveCaches(playhead)` on
 * whatever schedule it wants, passing in whatever it considers the current
 * playback position to be.
 */
class TranscodeSessionManagerImpl {
  private currentSession: TranscodeSession | null = null;
  private errorCallbacks: TranscodeErrorCallback[] = [];

  /**
   * Starts a new transcoding session for the given media file.
   * Stops any existing session first.
   *
   * Note: This does NOT start any FFmpeg processes yet. Variants are created
   * on-demand when clients request specific resolutions.
   */
  startSession(mediaFileId: string, inputPath: string): TranscodeSession {
    // Stop any existing session
    this.stopSession();

    // Clean up old cache directory for this media file
    const outputDir = path.join(CACHE_DIR, mediaFileId);
    this.cleanDirectory(outputDir);

    // Create a new session
    const session = new TranscodeSession(mediaFileId, inputPath, outputDir);

    // Wire error callbacks
    session.onError((resolution, error) => {
      for (const cb of this.errorCallbacks) {
        cb(resolution, error);
      }
    });

    this.currentSession = session;
    console.log(`[manager] Started new session for media ${mediaFileId}`);

    return session;
  }

  /**
   * Returns the current active session, or null if nothing is playing.
   */
  getSession(): TranscodeSession | null {
    return this.currentSession;
  }

  /**
   * Manages the rolling cache and FFmpeg throttling for the active session.
   * The caller owns scheduling (e.g. a `setInterval`) and supplying the
   * current playhead position.
   */
  manageActiveCaches(currentPlayhead: number): void {
    if (this.currentSession) {
      this.currentSession.manageActiveCaches(currentPlayhead);
    }
  }

  /**
   * Stops the current session and kills all FFmpeg processes.
   */
  stopSession(): void {
    if (this.currentSession) {
      console.log(`[manager] Stopping session for media ${this.currentSession.mediaFileId}`);
      this.currentSession.stop();
      this.currentSession = null;
    }
  }

  /**
   * Registers a callback for transcoding errors.
   * Used by the bootstrap to broadcast errors to connected clients.
   */
  onError(callback: TranscodeErrorCallback): void {
    this.errorCallbacks.push(callback);
  }

  /**
   * Recursively removes a directory and all its contents.
   */
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

/** Singleton instance */
export const TranscodeSessionManager = new TranscodeSessionManagerImpl();
