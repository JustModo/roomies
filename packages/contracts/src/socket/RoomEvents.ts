import { z } from 'zod';

// Client -> Server
export const ClientRoomJoinSchema = z.object({
  event: z.literal('room.join'),
  payload: z.object({}),
});

export const ClientRoomLeaveSchema = z.object({
  event: z.literal('room.leave'),
  payload: z.object({}),
});

export const ClientRoomReadySchema = z.object({
  event: z.literal('room.ready'),
  payload: z.object({}),
});

export const ClientRoomNotReadySchema = z.object({
  event: z.literal('room.not_ready'),
  payload: z.object({}),
});

// Server -> Client
export const ServerRoomStateSchema = z.object({
  event: z.literal('room.state'),
  payload: z.object({
    room: z.object({
      mediaId: z.string().optional(),
      mediaTitle: z.string().optional(),
      hlsUrl: z.string().optional(),
      duration: z.number().optional(),
      playback: z.object({
        state: z.enum(['waiting', 'playing', 'paused', 'buffering']),
        anchorPosition: z.number(),
        anchorTime: z.number(),
        playbackRate: z.number(),
      }),
      members: z.array(z.object({
        userId: z.string(),
        username: z.string(),
        ready: z.boolean(),
        buffering: z.boolean(),
        position: z.number(),
      })),
    })
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
  }),
});

export const ServerUserReadyChangedSchema = z.object({
  event: z.literal('user.ready_changed'),
  payload: z.object({
    userId: z.string(),
    ready: z.boolean(),
  }),
});
