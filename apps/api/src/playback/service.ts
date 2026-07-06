import { SocketContext } from '../websocket/router';
import { IncomingSocketMessage } from '@roomies/contracts';
import { roomStore } from '../room/store';
import { SocketEmitter } from '../websocket/emitter';

type PlayPayload = Extract<IncomingSocketMessage, { event: 'playback.play' }>['payload'];
type PausePayload = Extract<IncomingSocketMessage, { event: 'playback.pause' }>['payload'];
type SeekPayload = Extract<IncomingSocketMessage, { event: 'playback.seek' }>['payload'];
type ChangeMediaPayload = Extract<IncomingSocketMessage, { event: 'playback.change_media' }>['payload'];
type SetRatePayload = Extract<IncomingSocketMessage, { event: 'playback.set_rate' }>['payload'];

export class PlaybackService {
  static async handlePlay(payload: PlayPayload, ctx: SocketContext) {
    roomStore.setPlaybackState('playing');
    SocketEmitter.broadcastToRoom(ctx.app, {
      event: 'playback.state',
      payload: roomStore.getState().playback
    });
  }

  static async handlePause(payload: PausePayload, ctx: SocketContext) {
    roomStore.setPlaybackState('paused');
    SocketEmitter.broadcastToRoom(ctx.app, {
      event: 'playback.state',
      payload: roomStore.getState().playback
    });
  }

  static async handleSeek(payload: SeekPayload, ctx: SocketContext) {
    roomStore.updatePlayback({ anchorPosition: payload.position, anchorTime: Date.now() });
    SocketEmitter.broadcastToRoom(ctx.app, {
      event: 'playback.state',
      payload: roomStore.getState().playback
    });
  }

  static async handleChangeMedia(payload: ChangeMediaPayload, ctx: SocketContext) {
    roomStore.updateMedia(payload.mediaUrl, 0); // duration unknown at start
    roomStore.setPlaybackState('waiting');
    
    const state = roomStore.getState();
    state.members.forEach(m => {
      roomStore.updateMember(m.userId, { ready: false, buffering: false });
    });

    SocketEmitter.broadcastToRoom(ctx.app, {
      event: 'room.state',
      payload: { room: roomStore.getState() }
    });
  }

  static async handleSetRate(payload: SetRatePayload, ctx: SocketContext) {
    roomStore.updatePlayback({ playbackRate: payload.rate, anchorTime: Date.now() });
    SocketEmitter.broadcastToRoom(ctx.app, {
      event: 'playback.state',
      payload: roomStore.getState().playback
    });
  }
}
