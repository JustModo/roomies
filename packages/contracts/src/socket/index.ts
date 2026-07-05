import { z } from 'zod';
import { ClientPlaySchema, ClientPauseSchema, ClientSeekSchema, ClientJoinSchema, ClientHeartbeatSchema, ServerPlaySchema, ServerPauseSchema, ServerSeekSchema, ServerPartyStateSchema } from './PlaybackEvents';
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
  ClientJoinSchema,
  ClientHeartbeatSchema,
  ClientChatSchema,
]);

export const OutgoingSocketMessageSchema = z.discriminatedUnion('event', [
  ServerPlaySchema,
  ServerPauseSchema,
  ServerSeekSchema,
  ServerPartyStateSchema,
  ServerChatSchema,
]);

export type IncomingSocketMessage = z.infer<typeof IncomingSocketMessageSchema>;
export type OutgoingSocketMessage = z.infer<typeof OutgoingSocketMessageSchema>;

