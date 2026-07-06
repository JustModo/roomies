import { SocketContext } from '../websocket/router';
import { IncomingSocketMessage } from '@roomies/contracts';

type PlayPayload = Extract<IncomingSocketMessage, { event: 'playback.play' }>['payload'];
type PausePayload = Extract<IncomingSocketMessage, { event: 'playback.pause' }>['payload'];
type SeekPayload = Extract<IncomingSocketMessage, { event: 'playback.seek' }>['payload'];
type ChangeMediaPayload = Extract<IncomingSocketMessage, { event: 'playback.change_media' }>['payload'];
type SetRatePayload = Extract<IncomingSocketMessage, { event: 'playback.set_rate' }>['payload'];

export class PlaybackService {
  static async handlePlay(payload: PlayPayload, ctx: SocketContext) {
    // TODO: Handle play
  }

  static async handlePause(payload: PausePayload, ctx: SocketContext) {
    // TODO: Handle pause
  }

  static async handleSeek(payload: SeekPayload, ctx: SocketContext) {
    // TODO: Handle seek
  }

  static async handleChangeMedia(payload: ChangeMediaPayload, ctx: SocketContext) {
    // TODO: Handle change media
  }

  static async handleSetRate(payload: SetRatePayload, ctx: SocketContext) {
    // TODO: Handle set rate
  }
}
