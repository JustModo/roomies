import path from 'path';
import { prisma } from '../database/sqlite';
import { playbackStateStore, PlaybackState } from './store';
import { TranscodeSessionManager } from '../transcoding/manager';
import { chatStore } from '../chat/store';
import { StartPartyResponse } from '@roomies/contracts';

// Directory that Caddy serves HLS from
const CACHE_DIR = process.env.CACHE_DIR || path.join(process.cwd(), '..', '..', 'cache');

export const PlaybackService = {
  /**
   * Start a new party for a given media file.
   *
   * 1. Validates the media file exists in the library
   * 2. Stops any prior transcode session (kills FFmpeg, cleans cache)
   * 3. Seeds in-memory playback state
   * 4. Starts live FFmpeg transcoding (non-blocking — returns immediately)
   * 5. Returns the HLS URL so the client can start playing right away
   */
  async startParty(mediaFileId: string, leaderId: string): Promise<StartPartyResponse> {
    // Validate the media file exists
    const mediaFile = await prisma.mediaFile.findUniqueOrThrow({
      where: { id: mediaFileId },
    });

    const partyId = 'main';
    const outputDir = path.join(CACHE_DIR, partyId);

    // Only one active party is supported globally — this replaces any prior
    // state. Evict the previous party's chat history so the in-memory store
    // doesn't accumulate one entry per party for the life of the process.
    const previousPartyId = playbackStateStore.get()?.partyId;
    if (previousPartyId) {
      chatStore.remove(previousPartyId);
    }

    const state: PlaybackState = {
      partyId,
      currentMovieId: mediaFileId,
      leaderId,
      position: 0,
      speed: 1,
      isPaused: false,
      subtitleTrack: '',
      audioTrack: '',
      updatedAt: Date.now(),
    };
    playbackStateStore.set(state);

    // Start live transcoding — this kills any prior FFmpeg processes,
    // cleans the cache directory, spawns new FFmpeg processes for each
    // quality variant, and returns immediately with the HLS URL.
    // No waiting for transcoding to finish!
    const { hlsUrl } = await TranscodeSessionManager.startSession(
      partyId,
      mediaFile.path,
      outputDir,
    );

    return { partyId, hlsUrl };
  },

  /**
   * Get the globally active party.
   * Since there's only one active party per server in this architecture.
   */
  async getActiveParty(): Promise<PlaybackState | null> {
    return playbackStateStore.get();
  },

  /**
   * Get the current party state.
   * Returns null if no state exists (party not started).
   */
  async getPartyState(partyId: string): Promise<PlaybackState | null> {
    return playbackStateStore.getByPartyId(partyId);
  },

  /**
   * Update playback state (position, isPaused, etc.)
   */
  async updatePlaybackState(
    partyId: string,
    update: { position?: number; isPaused?: boolean; speed?: number }
  ) {
    const current = playbackStateStore.getByPartyId(partyId);
    if (!current) return;

    if (update.position !== undefined) current.position = update.position;
    if (update.isPaused !== undefined) current.isPaused = update.isPaused;
    if (update.speed !== undefined) current.speed = update.speed;
    current.updatedAt = Date.now();

    playbackStateStore.set(current);
  },

  /**
   * Stop the active party and kill all transcoding processes.
   * Called when the party is explicitly ended or the server shuts down.
   */
  async stopParty(): Promise<void> {
    await TranscodeSessionManager.stopSession();
    playbackStateStore.clear();
  },
};
