import path from 'path';
import { randomUUID } from 'crypto';
import { prisma } from '../database/sqlite';
import { playbackStateStore, PlaybackState } from './store';
import { transcodeQueue } from '../transcoding/queue';
import { setTranscodeStatus } from '../transcoding/status';
import { StartPartyResponse } from '@roomies/contracts';

// Directory that Caddy serves HLS from
const CACHE_DIR = process.env.CACHE_DIR || path.join(process.cwd(), '..', '..', 'cache');

export const PlaybackService = {
  /**
   * Start a new party for a given media file.
   * Creates a PlaybackSession record, seeds in-memory state, and enqueues a transcode job.
   */
  async startParty(mediaFileId: string, leaderId: string): Promise<StartPartyResponse> {
    // Validate the media file exists
    const mediaFile = await prisma.mediaFile.findUniqueOrThrow({
      where: { id: mediaFileId },
    });

    const partyId = randomUUID();
    const outputDir = path.join(CACHE_DIR, partyId);

    // Only one active party is supported globally — this replaces any prior state.
    const state: PlaybackState = {
      partyId,
      currentMovieId: mediaFileId,
      leaderId,
      position: 0,
      speed: 1,
      isPaused: true,
      subtitleTrack: '',
      audioTrack: '',
      updatedAt: Date.now(),
    };
    playbackStateStore.set(state);

    // Set initial transcode status so callers don't get null
    setTranscodeStatus(partyId, 'pending');

    // Enqueue the transcode job (non-blocking)
    await transcodeQueue.add(
      'hls-transcode',
      {
        partyId,
        inputPath: mediaFile.path,
        outputDir,
      },
      { jobId: partyId } // idempotent: same partyId = same job
    );

    return { partyId };
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
};
