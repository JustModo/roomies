import { z } from 'zod';

export const ClientPartyUpdateSchema = z.object({
  event: z.literal('party.update'),
  payload: z.object({
    isJoined: z.boolean().optional(),
    micMuted: z.boolean().optional(),
    videoMuted: z.boolean().optional(),
  }),
});

export const ServerPartyUpdatedSchema = z.object({
  event: z.literal('party.updated'),
  payload: z.object({
    userId: z.string(),
    party: z.object({
      isJoined: z.boolean(),
      micMuted: z.boolean(),
      videoMuted: z.boolean(),
    }),
  }),
});

/** Client → Server: one encoded audio chunk (base64, mimeType-tagged). */
export const ClientAudioChunkSchema = z.object({
  event: z.literal('party.audio_chunk'),
  payload: z.object({
    mimeType: z.string(),
    chunk: z.string(), // base64-encoded Ogg/Opus frame sequence
  }),
});

/** Server → Client: relayed audio chunk from another party member. */
export const ServerAudioChunkSchema = z.object({
  event: z.literal('party.audio_chunk'),
  payload: z.object({
    sourceUserId: z.string(),
    mimeType: z.string(),
    chunk: z.string(), // base64-encoded Ogg/Opus frame sequence
  }),
});
