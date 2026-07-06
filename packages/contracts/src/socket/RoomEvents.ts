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

// Removed ready/not_ready in favor of sync.status

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
        status: z.enum(['ready', 'buffering']),
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

// Removed user.ready_changed in favor of user.status_changed
