export interface ChatMessage {
  userId: string;
  username: string;
  message: string;
  timestamp: Date;
}

import { CHAT_CONFIG } from './config';

// Single-node, in-memory replacement for the old Redis OM chat schema. Chat
// is explicitly ephemeral (per tasks/ARCHITECTURE.md) — a capped ring buffer
// is all that's needed; nothing here needs to survive a restart.
let messages: ChatMessage[] = [];

export const chatStore = {
  append(message: ChatMessage): void {
    messages.push(message);
    if (messages.length > CHAT_CONFIG.MAX_MESSAGES_PER_PARTY) {
      messages.splice(0, messages.length - CHAT_CONFIG.MAX_MESSAGES_PER_PARTY);
    }
  },

  getHistory(): ChatMessage[] {
    return messages;
  },

  // Called when a party ends (a new one starts) so the array is cleared
  clear(): void {
    messages = [];
  },
};
