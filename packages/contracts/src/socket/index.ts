import { z } from 'zod';

import {
  ClientRoomJoinSchema,
  ClientRoomLeaveSchema,
  ServerRoomStateSchema,
  ServerUserJoinedSchema,
  ServerUserLeftSchema,
} from './RoomEvents';

import {
  ClientSyncHeartbeatSchema,
  ClientSyncStatusSchema,
  ServerSyncCorrectSchema,
  ServerUserStatusChangedSchema,
} from './SyncEvents';

export {
  ClientSyncHeartbeatSchema,
  ClientSyncStatusSchema,
  ServerSyncCorrectSchema,
  ServerUserStatusChangedSchema,
};

import {
  ClientPlaybackPlaySchema, ClientPlaybackPauseSchema, ClientPlaybackSeekSchema, ClientPlaybackSetRateSchema,
  ServerPlaybackStateSchema, ServerMediaChangedSchema
} from './PlaybackEvents';

import {
  ClientChatSendSchema, ServerChatMessageSchema
} from './ChatEvents';

import {
  ServerErrorSchema
} from './ErrorEvents';

export * from './RoomEvents';
export * from './PlaybackEvents';
export * from './SyncEvents';
export * from './ChatEvents';
export * from './ErrorEvents';

// duplicate imports removed

export const IncomingSocketMessageSchema = z.discriminatedUnion('event', [
  // Room
  ClientRoomJoinSchema,
  ClientRoomLeaveSchema,

  // Playback (media change is now HTTP-only, not a socket event)
  ClientPlaybackPlaySchema,
  ClientPlaybackPauseSchema,
  ClientPlaybackSeekSchema,
  ClientPlaybackSetRateSchema,

  // Sync
  ClientSyncHeartbeatSchema,
  ClientSyncStatusSchema,

  // Chat
  ClientChatSendSchema,
]);

export const OutgoingSocketMessageSchema = z.discriminatedUnion('event', [
  // Room
  ServerRoomStateSchema,
  ServerUserJoinedSchema,
  ServerUserLeftSchema,

  // Playback
  ServerPlaybackStateSchema,
  ServerMediaChangedSchema,

  // Sync
  ServerSyncCorrectSchema,
  ServerUserStatusChangedSchema,

  // Chat
  ServerChatMessageSchema,

  // Error
  ServerErrorSchema,
]);

export type IncomingSocketMessage = z.infer<typeof IncomingSocketMessageSchema>;
export type OutgoingSocketMessage = z.infer<typeof OutgoingSocketMessageSchema>;
