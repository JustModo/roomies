import { SocketContext, SocketEventHandler } from '../websocket/router';
import { roomStore } from '../room/store';

export const withPlaybackLock = (handler: SocketEventHandler): SocketEventHandler => {
  return async (payload: unknown, ctx: SocketContext) => {
    const state = roomStore.getState();
    if (state.playback.state === 'waiting' || state.playback.state === 'buffering' || !state.mediaId) {
      return;
    }
    await handler(payload, ctx);
  };
};
