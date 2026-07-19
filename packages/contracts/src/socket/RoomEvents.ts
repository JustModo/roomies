import { z } from 'zod';

export const ClientRoomJoinSchema = z.object({
  event: z.literal('room.join'),
  payload: z.object({}),
});

export const ClientRoomLeaveSchema = z.object({
  event: z.literal('room.leave'),
  payload: z.object({}),
});

export const ServerRoomStateSchema = z.object({
  event: z.literal('room.state'),
  payload: z.object({
    room: z.object({
      mediaId: z.string().optional(),
      mediaTitle: z.string().optional(),
      hlsUrl: z.string().optional(),
      duration: z.number().optional(),
      transcodeOffset: z.number().optional(),
      subtitles: z.array(z.object({ id: z.string(), language: z.string().nullable() })).optional(),
      playback: z.object({
        state: z.enum(['waiting', 'playing', 'paused', 'buffering']),
        intendedState: z.enum(['playing', 'paused']),
        anchorPosition: z.number(),
        anchorTime: z.number(),
        playbackRate: z.number(),
      }),
      members: z.array(z.object({
        userId: z.string(),
        username: z.string(),
        status: z.enum(['ready', 'buffering', 'async']),
        position: z.number(),
        asyncTranscodeOffset: z.number().optional(),
        controlsLocked: z.boolean(),
        party: z.object({
          isJoined: z.boolean(),
          micMuted: z.boolean(),
          videoMuted: z.boolean(),
        }),
        pingQuality: z.number(),
      })),
    })
  }),
});

export const ClientSetControlLockSchema = z.object({
  event: z.literal('room.set_control_lock'),
  payload: z.object({
    userId: z.string(),
    locked: z.boolean(),
  }),
});

export const ServerUserJoinedSchema = z.object({
  event: z.literal('user.joined'),
  payload: z.object({
    userId: z.string(),
    username: z.string(),
  }),
});

export const ServerUserLeftSchema = z.object({
  event: z.literal('user.left'),
  payload: z.object({
    userId: z.string(),
    username: z.string(),
  }),
});
