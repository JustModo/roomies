import { z } from 'zod';

// Client -> Server
export const ClientPlaybackPlaySchema = z.object({
  event: z.literal('playback.play'),
  payload: z.object({}),
});

export const ClientPlaybackPauseSchema = z.object({
  event: z.literal('playback.pause'),
  payload: z.object({}),
});

export const ClientPlaybackSeekSchema = z.object({
  event: z.literal('playback.seek'),
  payload: z.object({
    position: z.number(),
  }),
});

export const ClientPlaybackSetRateSchema = z.object({
  event: z.literal('playback.set_rate'),
  payload: z.object({
    rate: z.number(),
  }),
});

// Server -> Client
export const ServerPlaybackStateSchema = z.object({
  event: z.literal('playback.state'),
  payload: z.object({
    state: z.enum(['waiting', 'playing', 'paused', 'buffering']),
    anchorPosition: z.number(),
    anchorTime: z.number(),
    playbackRate: z.number(),
  }),
});

export const ServerMediaChangedSchema = z.object({
  event: z.literal('media.changed'),
  payload: z.object({
    mediaFileId: z.string(),
    title: z.string(),
    hlsUrl: z.string(),
  }),
});
