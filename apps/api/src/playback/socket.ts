import { SocketContext } from '../websocket/router';
import { IncomingSocketMessage } from '@roomies/contracts/src/socket';

type PlayPayload = Extract<IncomingSocketMessage, { event: 'client.play' }>['payload'];
type PausePayload = Extract<IncomingSocketMessage, { event: 'client.pause' }>['payload'];

export const handleClientPlay = async (payload: PlayPayload, ctx: SocketContext) => {
  ctx.app.log.info({ userId: ctx.userId, position: payload.position }, 'Feature: Play event received');
  // TODO: Update Redis playbackState and broadcast
};

export const handleClientPause = async (payload: PausePayload, ctx: SocketContext) => {
  ctx.app.log.info({ userId: ctx.userId, position: payload.position }, 'Feature: Pause event received');
  // TODO: Update Redis playbackState and broadcast
};
