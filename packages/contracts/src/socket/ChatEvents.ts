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

// Emoji reaction events
export const ClientEmojiSendSchema = z.object({
  event: z.literal('emoji.send'),
  payload: z.object({
    emoji: z.string().min(1).max(8), // Unicode emoji character(s)
  }),
});

export const ServerEmojiReactionSchema = z.object({
  event: z.literal('emoji.reaction'),
  payload: z.object({
    userId: z.string(),
    username: z.string(),
    emoji: z.string(),
    timestamp: z.number(), // Unix ms for animation sync
  }),
});

export type ClientEmojiSend = z.infer<typeof ClientEmojiSendSchema>;
export type ServerEmojiReaction = z.infer<typeof ServerEmojiReactionSchema>;
