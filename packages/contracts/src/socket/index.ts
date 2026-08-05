import { z } from 'zod';

import {
  ClientRoomJoinSchema,
  ClientRoomLeaveSchema,
  ServerRoomStateSchema,
  ServerUserJoinedSchema,
  ServerUserLeftSchema,
  ClientSetControlLockSchema,
  ClientUpdateRoomSettingsSchema,
} from './RoomEvents';

import {
  ClientSyncHeartbeatSchema,
  ClientSyncStatusSchema,
  ServerSyncCorrectSchema,
  ServerUserStatusChangedSchema,
  ServerSyncHeartbeatAckSchema,
} from './SyncEvents';

import {
  ClientPartyUpdateSchema,
  ServerPartyUpdatedSchema,
  ClientAudioChunkSchema,
  ServerAudioChunkSchema,
} from './PartyEvents';

export {
  ClientSyncHeartbeatSchema,
  ClientSyncStatusSchema,
  ServerSyncCorrectSchema,
  ServerUserStatusChangedSchema,
  ServerSyncHeartbeatAckSchema,
};

export * from './PartyEvents';

import {
  ClientPlaybackPlaySchema, ClientPlaybackPauseSchema, ClientPlaybackSeekSchema, ClientPlaybackSetRateSchema,
  ServerPlaybackStateSchema, ServerMediaChangedSchema
} from './PlaybackEvents';

import {
  ClientChatSendSchema, ServerChatMessageSchema,
  ClientEmojiSendSchema, ServerEmojiReactionSchema
} from './ChatEvents';

import {
  ServerErrorSchema
} from './ErrorEvents';

import {
  ServerAuthKickedSchema,
  ServerAuthUnauthorizedSchema
} from './AuthEvents';

export * from './RoomEvents';
export * from './PlaybackEvents';
export * from './SyncEvents';
export * from './ChatEvents';
export * from './ErrorEvents';
export * from './AuthEvents';

export const IncomingSocketMessageSchema = z.discriminatedUnion('event', [
  ClientRoomJoinSchema,
  ClientRoomLeaveSchema,
  ClientSetControlLockSchema,
  ClientUpdateRoomSettingsSchema,

  ClientPartyUpdateSchema,
  ClientAudioChunkSchema,

  ClientPlaybackPlaySchema,
  ClientPlaybackPauseSchema,
  ClientPlaybackSeekSchema,
  ClientPlaybackSetRateSchema,

  ClientSyncHeartbeatSchema,
  ClientSyncStatusSchema,

  ClientChatSendSchema,
  ClientEmojiSendSchema,
]);

export const OutgoingSocketMessageSchema = z.discriminatedUnion('event', [
  ServerRoomStateSchema,
  ServerUserJoinedSchema,
  ServerUserLeftSchema,

  ServerPartyUpdatedSchema,
  ServerAudioChunkSchema,

  ServerPlaybackStateSchema,
  ServerMediaChangedSchema,

  ServerSyncCorrectSchema,
  ServerUserStatusChangedSchema,
  ServerSyncHeartbeatAckSchema,

  ServerChatMessageSchema,
  ServerEmojiReactionSchema,

  ServerErrorSchema,

  ServerAuthKickedSchema,
  ServerAuthUnauthorizedSchema,
]);

export type IncomingSocketMessage = z.infer<typeof IncomingSocketMessageSchema>;
export type OutgoingSocketMessage = z.infer<typeof OutgoingSocketMessageSchema>;
