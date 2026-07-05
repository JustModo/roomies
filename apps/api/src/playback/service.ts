import path from 'path';
import { randomUUID } from 'crypto';
import { prisma } from '../database/postgres';
import { redis } from '../database/redis';
import { playbackStateRepository } from './redis';
import { transcodeQueue, transcodeStatusKey } from '../transcoding/queue';
import { StartPartyResponse } from '@roomies/contracts';

// Directory that Caddy serves HLS from
const CACHE_DIR = process.env.CACHE_DIR || path.join(process.cwd(), '..', '..', 'cache');

export const PlaybackService = {
  /**
   * Start a new party for a given media file.
   * Creates a PlaybackSession in Postgres, seeds Redis state, and enqueues a transcode job.
   */
  async startParty(mediaFileId: string, leaderId: string): Promise<StartPartyResponse> {
    // Validate the media file exists
    const mediaFile = await prisma.mediaFile.findUniqueOrThrow({
      where: { id: mediaFileId },
    });

    const partyId = randomUUID();
    const outputDir = path.join(CACHE_DIR, partyId);

    // Clear any existing active parties
    const existingStates = await playbackStateRepository.search().return.all();
    for (const state of existingStates) {
      await playbackStateRepository.remove(state.entityId);
    }

    // Seed the playback state in Redis OM
    await playbackStateRepository.save({
      partyId,
      currentMovieId: mediaFileId,
      leaderId,
      position: 0,
      speed: 1,
      isPaused: true,
      subtitleTrack: '',
      audioTrack: '',
      updatedAt: Date.now(),
    });

    // Set initial transcode status so callers don't get null
    await redis.set(transcodeStatusKey(partyId), 'pending', { EX: 86400 });

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
  async getActiveParty() {
    const states = await playbackStateRepository.search().return.first();
    return states ?? null;
  },

  /**
   * Get the current party state from Redis.
   * Returns null if no state exists (party not started or expired).
   */
  async getPartyState(partyId: string) {
    const states = await playbackStateRepository
      .search()
      .where('partyId')
      .equals(partyId)
      .return.first();

    return states ?? null;
  },

  /**
   * Update playback state in Redis (position, isPaused, etc.)
   */
  async updatePlaybackState(
    partyId: string,
    update: { position?: number; isPaused?: boolean; speed?: number }
  ) {
    const states = await playbackStateRepository
      .search()
      .where('partyId')
      .equals(partyId)
      .return.all();

    if (states.length === 0) return;

    const current = states[0];
    if (update.position !== undefined) current.position = update.position;
    if (update.isPaused !== undefined) current.isPaused = update.isPaused;
    if (update.speed !== undefined) current.speed = update.speed;
    current.updatedAt = Date.now();

    await playbackStateRepository.save(current);
  },
};
