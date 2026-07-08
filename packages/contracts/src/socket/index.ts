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

export const IncomingSocketMessageSchema = z.discriminatedUnion('event', [
  ClientRoomJoinSchema,
  ClientRoomLeaveSchema,

  ClientPlaybackPlaySchema,
  ClientPlaybackPauseSchema,
  ClientPlaybackSeekSchema,
  ClientPlaybackSetRateSchema,

  ClientSyncHeartbeatSchema,
  ClientSyncStatusSchema,

  ClientChatSendSchema,
]);

export const OutgoingSocketMessageSchema = z.discriminatedUnion('event', [
  ServerRoomStateSchema,
  ServerUserJoinedSchema,
  ServerUserLeftSchema,

  ServerPlaybackStateSchema,
  ServerMediaChangedSchema,

  ServerSyncCorrectSchema,
  ServerUserStatusChangedSchema,

  ServerChatMessageSchema,

  ServerErrorSchema,
]);

export type IncomingSocketMessage = z.infer<typeof IncomingSocketMessageSchema>;
export type OutgoingSocketMessage = z.infer<typeof OutgoingSocketMessageSchema>;
