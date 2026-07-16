import { SocketContext, SocketEventHandler } from '../websocket/router';
import { roomStore } from '../room/store';

export const withPlaybackLock = (handler: SocketEventHandler): SocketEventHandler => {
  return async (payload: unknown, ctx: SocketContext) => {
    const state = roomStore.getState();

    // Always require active media.
    if (!state.mediaId) return;

    // User-scoped (async) commands bypass the room buffering lock —
    // async users have independent playback and should not be blocked
    // by the room's buffering state.
    const parsed = payload as Record<string, unknown> | undefined;
    if (parsed?.scope === 'user') {
      await handler(payload, ctx);
      return;
    }

    // Room-scoped commands are blocked while room is buffering/waiting.
    if (state.playback.state === 'waiting' || state.playback.state === 'buffering') {
      return;
    }
    await handler(payload, ctx);
  };
};
