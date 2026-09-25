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
