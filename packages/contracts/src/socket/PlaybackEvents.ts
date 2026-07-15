import { z } from 'zod';

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
    scope: z.enum(['room', 'user']).optional(),
    forceNewOffset: z.boolean().optional(),
  }),
});

export const ClientPlaybackSetRateSchema = z.object({
  event: z.literal('playback.set_rate'),
  payload: z.object({
    rate: z.number(),
  }),
});

export const ServerPlaybackStateSchema = z.object({
  event: z.literal('playback.state'),
  payload: z.object({
    state: z.enum(['waiting', 'playing', 'paused', 'buffering']),
    intendedState: z.enum(['playing', 'paused']),
    anchorPosition: z.number(),
    anchorTime: z.number(),
    playbackRate: z.number(),
    username: z.string().optional(),
    action: z.enum(['play', 'pause', 'seek', 'rate']).optional(),
  }),
});

export const ServerMediaChangedSchema = z.object({
  event: z.literal('media.changed'),
  payload: z.object({
    mediaFileId: z.string(),
    title: z.string(),
    hlsUrl: z.string(),
    duration: z.number().optional(),
    transcodeOffset: z.number().optional(),
    sessionScope: z.enum(['room', 'user']).optional(),
    subtitles: z.array(z.object({ id: z.string(), language: z.string().nullable() })).optional(),
  }),
});
