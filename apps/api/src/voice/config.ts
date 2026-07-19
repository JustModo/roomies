export const VOICE_PROTOCOL = {
  maxOpusPacketBytes: 1275,
  maxPacketsPerSecond: 60,
  rateLimitWindowMs: 1000,
  heartbeatIntervalMs: 5000,
  closeCodePolicyViolation: 1008,
} as const;

export type VoiceClientControlMessage =
  | { event: 'join' }
  | { event: 'leave' }
  | { event: 'pong' };

export type VoiceServerControlMessage =
  | { event: 'session_map'; payload: Record<string, number> }
  | { event: 'joined' }
  | { event: 'peer_joined'; payload: { userId: string; sessionId: number } }
  | { event: 'peer_left'; payload: { userId: string } }
  | { event: 'ping' }
  | { event: 'error'; payload: string };
