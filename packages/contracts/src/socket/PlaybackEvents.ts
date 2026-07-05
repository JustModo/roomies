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

export const ClientJoinSchema = z.object({
  event: z.literal('client.join'),
  payload: z.object({
  }),
});

export const ClientHeartbeatSchema = z.object({
  event: z.literal('client.heartbeat'),
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

export const ServerPartyStateSchema = z.object({
  event: z.literal('server.party.state'),
  payload: z.object({
    position: z.number(),
    isPaused: z.boolean(),
  }),
});

export const ServerViewersSchema = z.object({
  event: z.literal('server.viewers'),
  payload: z.object({
    count: z.number(),
  }),
});

export const ServerPartyStartedSchema = z.object({
  event: z.literal('server.party.started'),
  payload: z.object({
  }),
});

export const ServerTranscodeErrorSchema = z.object({
  event: z.literal('server.transcode.error'),
  payload: z.object({
    profileName: z.string(),
    error: z.string(),
  }),
});
