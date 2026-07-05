import { z } from 'zod';

export const ClientChatSchema = z.object({
  event: z.literal('client.chat'),
  payload: z.object({
    message: z.string().min(1).max(500),
  }),
});

export const ServerChatSchema = z.object({
  event: z.literal('server.chat'),
  payload: z.object({
    userId: z.string(),
    message: z.string(),
    timestamp: z.number(),
  }),
});
