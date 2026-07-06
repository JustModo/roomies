import { z } from 'zod';

// Client -> Server
export const ClientSyncHeartbeatSchema = z.object({
  event: z.literal('sync.heartbeat'),
  payload: z.object({
    position: z.number(),
    playing: z.boolean(),
    playbackRate: z.number(),
    timestamp: z.number().optional(),
  }),
});

export const ClientSyncBufferingSchema = z.object({
  event: z.literal('sync.buffering'),
  payload: z.object({}),
});

export const ClientSyncBufferedSchema = z.object({
  event: z.literal('sync.buffered'),
  payload: z.object({}),
});

// Server -> Client
export const ServerSyncCorrectSchema = z.object({
  event: z.literal('sync.correct'),
  payload: z.object({
    position: z.number(),
    playbackRate: z.number().optional(),
    seek: z.boolean().optional(),
  }),
});

export const ServerSyncWaitSchema = z.object({
  event: z.literal('sync.wait'),
  payload: z.object({}),
});

export const ServerSyncResumeSchema = z.object({
  event: z.literal('sync.resume'),
  payload: z.object({}),
});
