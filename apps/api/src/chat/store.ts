export interface ChatMessage {
  partyId: string;
  userId: string;
  message: string;
  timestamp: Date;
}

const MAX_MESSAGES_PER_PARTY = 500;

// Single-node, in-memory replacement for the old Redis OM chat schema. Chat
// is explicitly ephemeral (per tasks/ARCHITECTURE.md) — a capped ring buffer
// per party is all that's needed; nothing here needs to survive a restart.
const messagesByParty = new Map<string, ChatMessage[]>();

export const chatStore = {
  append(message: ChatMessage): void {
    const existing = messagesByParty.get(message.partyId) ?? [];
    existing.push(message);
    if (existing.length > MAX_MESSAGES_PER_PARTY) {
      existing.splice(0, existing.length - MAX_MESSAGES_PER_PARTY);
    }
    messagesByParty.set(message.partyId, existing);
  },

  getHistory(partyId: string): ChatMessage[] {
    return messagesByParty.get(partyId) ?? [];
  },

  // Called when a party ends (a new one starts) so the map doesn't grow one
  // entry per party for the lifetime of the process.
  remove(partyId: string): void {
    messagesByParty.delete(partyId);
  },
};
