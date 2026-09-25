import { RoomStore } from '../room/store';
import { SocketHub } from '../websocket/hub';
import { SocketContext, SocketPayload } from '../websocket/router';

export class PartyService {
  constructor(
    private readonly roomStore: RoomStore,
    private readonly hub: SocketHub,
  ) {}

  async handlePartyUpdate(payload: SocketPayload<'party.update'>, ctx: SocketContext) {
    const member = this.roomStore.getMember(ctx.userId);
    if (!member) return;

    const party = {
      isJoined: payload.isJoined ?? member.party.isJoined,
      micMuted: payload.micMuted ?? member.party.micMuted,
      videoMuted: payload.videoMuted ?? member.party.videoMuted,
    };

    this.roomStore.updateMember(ctx.userId, { party });
    this.hub.broadcast({ event: 'party.updated', payload: { userId: ctx.userId, party } });
  }
}
