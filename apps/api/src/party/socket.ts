import { SocketRouter } from '../websocket/router';
import { PartyService } from './service';

// Party state changes (joined, muted, etc.) go through the main /ws gateway.
export const registerPartySocketEvents = (router: SocketRouter, party: PartyService) => {
  router.on('party.update', (payload, ctx) => party.handlePartyUpdate(payload, ctx));
};
