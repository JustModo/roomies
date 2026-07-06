import { z } from 'zod';

import {
  ClientRoomJoinSchema, ClientRoomLeaveSchema, ClientRoomReadySchema, ClientRoomNotReadySchema,
  ServerRoomStateSchema, ServerUserJoinedSchema, ServerUserLeftSchema, ServerUserReadyChangedSchema
} from './RoomEvents';

import {
  ClientPlaybackPlaySchema, ClientPlaybackPauseSchema, ClientPlaybackSeekSchema, ClientPlaybackChangeMediaSchema, ClientPlaybackSetRateSchema,
  ServerPlaybackStateSchema
} from './PlaybackEvents';

import {
  ClientSyncHeartbeatSchema, ClientSyncBufferingSchema, ClientSyncBufferedSchema,
  ServerSyncCorrectSchema, ServerSyncWaitSchema, ServerSyncResumeSchema
} from './SyncEvents';

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
  // Room
  ClientRoomJoinSchema,
  ClientRoomLeaveSchema,
  ClientRoomReadySchema,
  ClientRoomNotReadySchema,

  // Playback
  ClientPlaybackPlaySchema,
  ClientPlaybackPauseSchema,
  ClientPlaybackSeekSchema,
  ClientPlaybackChangeMediaSchema,
  ClientPlaybackSetRateSchema,

  // Sync
  ClientSyncHeartbeatSchema,
  ClientSyncBufferingSchema,
  ClientSyncBufferedSchema,

  // Chat
  ClientChatSendSchema,
]);

export const OutgoingSocketMessageSchema = z.discriminatedUnion('event', [
  // Room
  ServerRoomStateSchema,
  ServerUserJoinedSchema,
  ServerUserLeftSchema,
  ServerUserReadyChangedSchema,

  // Playback
  ServerPlaybackStateSchema,

  // Sync
  ServerSyncCorrectSchema,
  ServerSyncWaitSchema,
  ServerSyncResumeSchema,

  // Chat
  ServerChatMessageSchema,

  // Error
  ServerErrorSchema,
]);

export type IncomingSocketMessage = z.infer<typeof IncomingSocketMessageSchema>;
export type OutgoingSocketMessage = z.infer<typeof OutgoingSocketMessageSchema>;
