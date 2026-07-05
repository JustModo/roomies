import { z } from 'zod';

// Incoming (Client -> Server)
export const ClientPlaySchema = z.object({
  event: z.literal('client.play'),
  payload: z.object({
    position: z.number(),
  }),
});

export const ClientPauseSchema = z.object({
  event: z.literal('client.pause'),
  payload: z.object({
    position: z.number(),
  }),
});

export const ClientSeekSchema = z.object({
  event: z.literal('client.seek'),
  payload: z.object({
    position: z.number(),
  }),
});

// Outgoing (Server -> Client)
export const ServerPlaySchema = z.object({
  event: z.literal('server.play'),
  payload: z.object({
    position: z.number(),
    timestamp: z.number(),
  }),
});

export const ServerPauseSchema = z.object({
  event: z.literal('server.pause'),
  payload: z.object({
    position: z.number(),
  }),
});

export const ServerSeekSchema = z.object({
  event: z.literal('server.seek'),
  payload: z.object({
    position: z.number(),
  }),
});
