import { SocketEmitter } from '../websocket/emitter';
import { roomStore } from '../room/store';
import { IncomingSocketMessage } from '@roomies/contracts';
import { SocketContext } from '../websocket/router';

type PartyUpdatePayload = Extract<IncomingSocketMessage, { event: 'party.update' }>['payload'];

export class PartyService {
  static async handlePartyUpdate(payload: PartyUpdatePayload, ctx: SocketContext) {
    const state = roomStore.getState();
    const member = state.members.find(m => m.userId === ctx.userId);
    if (!member) return;

    const newParty = {
      isJoined: payload.isJoined ?? member.party.isJoined,
      micMuted: payload.micMuted ?? member.party.micMuted,
      videoMuted: payload.videoMuted ?? member.party.videoMuted,
    };

    roomStore.updateMember(ctx.userId, { party: newParty });

    SocketEmitter.broadcastToRoom(ctx.app, {
      event: 'party.updated',
      payload: {
        userId: ctx.userId,
        party: newParty,
      }
    });
  }
}
