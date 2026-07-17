import { registerSocketEvent, SocketContext } from '../websocket/router';
import { PartyService } from './service';
import { IncomingSocketMessage } from '@roomies/contracts';

type PartyUpdatePayload = Extract<IncomingSocketMessage, { event: 'party.update' }>['payload'];

export const registerPartySocketEvents = () => {
  registerSocketEvent('party.update', async (payload: unknown, ctx: SocketContext) => {
    await PartyService.handlePartyUpdate(payload as PartyUpdatePayload, ctx);
  });
};
