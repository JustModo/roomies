import { WebSocket } from '@fastify/websocket';
import { SocketContext, registerSocketEvent } from '../websocket/router';
import { IncomingSocketMessage, OutgoingSocketMessage } from '@roomies/contracts';
import { PlaybackService } from './service';

type PlayPayload = Extract<IncomingSocketMessage, { event: 'client.play' }>['payload'];
type PausePayload = Extract<IncomingSocketMessage, { event: 'client.pause' }>['payload'];
type SeekPayload = Extract<IncomingSocketMessage, { event: 'client.seek' }>['payload'];
type JoinPayload = Extract<IncomingSocketMessage, { event: 'client.join' }>['payload'];
type HeartbeatPayload = Extract<IncomingSocketMessage, { event: 'client.heartbeat' }>['payload'];

/**
 * Broadcast an outgoing socket message to all sockets in the party room.
 * The room set lives on the app instance.
 */
const broadcastToRoom = (ctx: SocketContext, message: OutgoingSocketMessage) => {
  const room = (ctx.app as any).room as Set<WebSocket> | undefined;
  if (!room) return;

  const serialized = JSON.stringify(message);
  for (const socket of room) {
    if (socket.readyState === 1 /* OPEN */) {
      socket.send(serialized);
    }
  }
};

export const getRoomSize = (app: any): number => {
  const room = app.room as Set<WebSocket> | undefined;
  return room ? room.size : 0;
};

const broadcastViewersCount = (ctx: SocketContext) => {
  const count = getRoomSize(ctx.app);
  const msg: OutgoingSocketMessage = {
    event: 'server.viewers',
    payload: { count },
  };
  broadcastToRoom(ctx, msg);
};

export const handleClientJoin = async (payload: JoinPayload, ctx: SocketContext) => {

  // Register this socket in the room
  const room: Set<WebSocket> = (ctx.app as any).room;
  room.add(ctx.socket);

  // Send current state back to the joining client
  const state = await PlaybackService.getPartyState();
  if (state) {
    const msg: OutgoingSocketMessage = {
      event: 'server.party.state',
      payload: {
        position: state.position as number,
        isPaused: state.isPaused as boolean,
      },
    };
    ctx.socket.send(JSON.stringify(msg));
  }

  ctx.app.log.info({ userId: ctx.userId }, 'User joined party room');
  
  // Broadcast updated viewers count
  broadcastViewersCount(ctx);
};

export const handleClientPlay = async (payload: PlayPayload, ctx: SocketContext) => {
  await PlaybackService.updatePlaybackState({ position: payload.position, isPaused: false });

  const msg: OutgoingSocketMessage = {
    event: 'server.play',
    payload: { position: payload.position, timestamp: Date.now() },
  };
  broadcastToRoom(ctx, msg);
};

export const handleClientPause = async (payload: PausePayload, ctx: SocketContext) => {
  await PlaybackService.updatePlaybackState({ position: payload.position, isPaused: true });

  const msg: OutgoingSocketMessage = {
    event: 'server.pause',
    payload: { position: payload.position },
  };
  broadcastToRoom(ctx, msg);
};

export const handleClientSeek = async (payload: SeekPayload, ctx: SocketContext) => {
  await PlaybackService.updatePlaybackState({ position: payload.position });

  const msg: OutgoingSocketMessage = {
    event: 'server.seek',
    payload: { position: payload.position },
  };
  broadcastToRoom(ctx, msg);
};

// Clients drifting more than this many seconds from the server-expected
// position get force-corrected via a direct server.seek, per
// tasks/ARCHITECTURE.md's Sync Engine spec.
const DRIFT_THRESHOLD_SECONDS = 2;

export const handleClientHeartbeat = async (payload: HeartbeatPayload, ctx: SocketContext) => {
  ctx.app.log.trace({ userId: ctx.userId, position: payload.position }, 'Heartbeat received');

  const state = await PlaybackService.getPartyState();
  if (!state) return;

  // Expected server-side position, extrapolated from the last known state.
  const elapsedSeconds = state.isPaused ? 0 : (Date.now() - state.updatedAt) / 1000;
  const expectedPosition = state.position + elapsedSeconds * state.speed;

  const drift = Math.abs(expectedPosition - payload.position);
  if (drift <= DRIFT_THRESHOLD_SECONDS) return;

  // Rubberband only the drifting client — everyone else is left alone.
  const correction: OutgoingSocketMessage = {
    event: 'server.seek',
    payload: { position: expectedPosition },
  };
  ctx.socket.send(JSON.stringify(correction));

  ctx.app.log.info(
    { userId: ctx.userId, drift, expectedPosition, reportedPosition: payload.position },
    'Sync Engine: corrected drifting client'
  );
};

/**
 * Called from the gateway on socket close — removes socket from its party room.
 */
export const removeFromRoom = (ctx: SocketContext) => {
  const room = (ctx.app as any).room as Set<WebSocket> | undefined;
  if (room) {
    room.delete(ctx.socket);
    broadcastViewersCount(ctx);
  }
};

export const registerPlaybackSocketEvents = () => {
  registerSocketEvent('client.join', handleClientJoin);
  registerSocketEvent('client.play', handleClientPlay);
  registerSocketEvent('client.pause', handleClientPause);
  registerSocketEvent('client.seek', handleClientSeek);
  registerSocketEvent('client.heartbeat', handleClientHeartbeat);
};
