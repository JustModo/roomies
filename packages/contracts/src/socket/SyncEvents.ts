import { z } from 'zod';

export const ClientSyncHeartbeatSchema = z.object({
  event: z.literal('sync.heartbeat'),
  payload: z.object({
    position: z.number(),
    playing: z.boolean(),
    playbackRate: z.number(),
    timestamp: z.number().optional(),
  }),
});

export const ClientSyncStatusSchema = z.object({
  event: z.literal('sync.status'),
  payload: z.object({
    status: z.enum(['ready', 'buffering', 'async']),
  }),
});

export const ServerSyncCorrectSchema = z.object({
  event: z.literal('sync.correct'),
  payload: z.object({
    position: z.number(),
    playbackRate: z.number().optional(),
    correctionDurationMs: z.number().optional(),
    seek: z.boolean().optional(),
  }),
});

export const ServerUserStatusChangedSchema = z.object({
  event: z.literal('user.status_changed'),
  payload: z.object({
    userId: z.string(),
    status: z.enum(['ready', 'buffering', 'async']),
  }),
});
