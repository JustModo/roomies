import { z } from 'zod';

export const ClientChatSendSchema = z.object({
  event: z.literal('chat.send'),
  payload: z.object({
    message: z.string().min(1).max(500),
  }),
});

export const ServerChatMessageSchema = z.object({
  event: z.literal('chat.message'),
  payload: z.object({
    userId: z.string(),
    username: z.string(),
    message: z.string(),
    timestamp: z.string(),
  }),
});
