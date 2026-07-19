import { registerSocketEvent, SocketContext } from '../websocket/router';
import { PartyService } from './service';
import { IncomingSocketMessage } from '@roomies/contracts';

type PartyUpdatePayload = Extract<IncomingSocketMessage, { event: 'party.update' }>['payload'];

export const registerPartySocketEvents = () => {
  // Party state changes (joined, muted, etc.) go through the main /ws gateway
  registerSocketEvent('party.update', async (payload: unknown, ctx: SocketContext) => {
    await PartyService.handlePartyUpdate(payload as PartyUpdatePayload, ctx);
  });

  // party.audio_chunk is handled entirely in the voice gateway (/ws/voice).
  // No handler registered here — audio never touches the main message router.
};
