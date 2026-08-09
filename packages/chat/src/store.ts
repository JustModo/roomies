export interface ChatMessage {
  userId: string;
  username: string;
  message: string;
  timestamp: Date;
}

import { CHAT_CONFIG } from './config';

// In-memory ephemeral ring buffer for chat messages.
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
