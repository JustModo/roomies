import { z } from 'zod';
import { ClientPlaySchema, ClientPauseSchema, ClientSeekSchema, ServerPlaySchema, ServerPauseSchema, ServerSeekSchema } from './PlaybackEvents';
import { ClientChatSchema, ServerChatSchema } from './ChatEvents';

// Export individual schemas
export * from './PlaybackEvents';
export * from './ChatEvents';
// export * from './VoiceEvents';
// export * from './PresenceEvents';
// export * from './SyncEvents';

// Master Discriminated Unions for automatic narrowing
export const IncomingSocketMessageSchema = z.discriminatedUnion('event', [
  ClientPlaySchema,
  ClientPauseSchema,
  ClientSeekSchema,
  ClientChatSchema,
]);

export const OutgoingSocketMessageSchema = z.discriminatedUnion('event', [
  ServerPlaySchema,
  ServerPauseSchema,
  ServerSeekSchema,
  ServerChatSchema,
]);

export type IncomingSocketMessage = z.infer<typeof IncomingSocketMessageSchema>;
export type OutgoingSocketMessage = z.infer<typeof OutgoingSocketMessageSchema>;
