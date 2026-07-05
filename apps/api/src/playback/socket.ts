import { WebSocket } from '@fastify/websocket';
import { SocketContext } from '../websocket/router';
import { IncomingSocketMessage, OutgoingSocketMessage } from '@roomies/contracts';
import { PlaybackService } from './service';

type PlayPayload = Extract<IncomingSocketMessage, { event: 'client.play' }>['payload'];
type PausePayload = Extract<IncomingSocketMessage, { event: 'client.pause' }>['payload'];
type SeekPayload = Extract<IncomingSocketMessage, { event: 'client.seek' }>['payload'];
type JoinPayload = Extract<IncomingSocketMessage, { event: 'client.join' }>['payload'];
type HeartbeatPayload = Extract<IncomingSocketMessage, { event: 'client.heartbeat' }>['payload'];

/**
 * Broadcast an outgoing socket message to all sockets in the party room.
 * The room map lives on the app instance.
 */
const broadcastToRoom = (ctx: SocketContext, partyId: string, message: OutgoingSocketMessage) => {
  const room = (ctx.app as any).rooms.get(partyId) as Set<WebSocket> | undefined;
  if (!room) return;

  const serialized = JSON.stringify(message);
  for (const socket of room) {
    if (socket.readyState === 1 /* OPEN */) {
      socket.send(serialized);
    }
  }
};

export const handleClientJoin = async (payload: JoinPayload, ctx: SocketContext) => {
  const { partyId } = payload;

  // Register this socket in the room
  const rooms: Map<string, Set<WebSocket>> = (ctx.app as any).rooms;
  if (!rooms.has(partyId)) {
    rooms.set(partyId, new Set());
  }
  rooms.get(partyId)!.add(ctx.socket);

  // Also store the partyId on the socket context for cleanup on disconnect
  (ctx.socket as any).__partyId = partyId;

  // Send current state back to the joining client
  const state = await PlaybackService.getPartyState(partyId);
  if (state) {
    const msg: OutgoingSocketMessage = {
      event: 'server.party.state',
      payload: {
        partyId,
        position: state.position as number,
        isPaused: state.isPaused as boolean,
        leaderId: state.leaderId as string,
      },
    };
    ctx.socket.send(JSON.stringify(msg));
  }

  ctx.app.log.info({ userId: ctx.userId, partyId }, 'User joined party room');
};

/**
 * Only the party leader (the user who started the party) may drive playback.
 * Guards against any joined member hijacking play/pause/seek for the room.
 */
const isLeader = async (partyId: string, userId: string): Promise<boolean> => {
  const state = await PlaybackService.getPartyState(partyId);
  return !!state && state.leaderId === userId;
};

export const handleClientPlay = async (payload: PlayPayload, ctx: SocketContext) => {
  const partyId: string = (ctx.socket as any).__partyId;
  if (!partyId) return;
  if (!(await isLeader(partyId, ctx.userId))) return;

  await PlaybackService.updatePlaybackState(partyId, { position: payload.position, isPaused: false });

  const msg: OutgoingSocketMessage = {
    event: 'server.play',
    payload: { position: payload.position, timestamp: Date.now() },
  };
  broadcastToRoom(ctx, partyId, msg);
};

export const handleClientPause = async (payload: PausePayload, ctx: SocketContext) => {
  const partyId: string = (ctx.socket as any).__partyId;
  if (!partyId) return;
  if (!(await isLeader(partyId, ctx.userId))) return;

  await PlaybackService.updatePlaybackState(partyId, { position: payload.position, isPaused: true });

  const msg: OutgoingSocketMessage = {
    event: 'server.pause',
    payload: { position: payload.position },
  };
  broadcastToRoom(ctx, partyId, msg);
};

export const handleClientSeek = async (payload: SeekPayload, ctx: SocketContext) => {
  const partyId: string = (ctx.socket as any).__partyId;
  if (!partyId) return;
  if (!(await isLeader(partyId, ctx.userId))) return;

  await PlaybackService.updatePlaybackState(partyId, { position: payload.position });

  const msg: OutgoingSocketMessage = {
    event: 'server.seek',
    payload: { position: payload.position },
  };
  broadcastToRoom(ctx, partyId, msg);
};

export const handleClientHeartbeat = async (payload: HeartbeatPayload, ctx: SocketContext) => {
  // Heartbeat is used by the Sync Engine (future).
  // For now, just keep the log quiet — heartbeats are high-frequency.
  ctx.app.log.trace({ userId: ctx.userId, position: payload.position }, 'Heartbeat received');
};

/**
 * Called from the gateway on socket close — removes socket from its party room.
 */
export const removeFromRoom = (ctx: SocketContext) => {
  const partyId: string | undefined = (ctx.socket as any).__partyId;
  if (!partyId) return;

  const rooms: Map<string, Set<WebSocket>> = (ctx.app as any).rooms;
  const room = rooms.get(partyId);
  if (room) {
    room.delete(ctx.socket);
    if (room.size === 0) rooms.delete(partyId);
  }
};
