import { VOICE_PROTOCOL, VoiceClientControlMessage } from './config';

export class VoicePacketRateLimiter {
  private windowStartedAt = Date.now();
  private packetsInWindow = 0;

  public allow(now = Date.now()): boolean {
    if (now - this.windowStartedAt >= VOICE_PROTOCOL.rateLimitWindowMs) {
      this.windowStartedAt = now;
      this.packetsInWindow = 0;
    }

    this.packetsInWindow++;
    return this.packetsInWindow <= VOICE_PROTOCOL.maxPacketsPerSecond;
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

export const parseVoiceClientControlMessage = (raw: string): VoiceClientControlMessage | null => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }

  if (!isRecord(parsed) || typeof parsed.event !== 'string') return null;

  switch (parsed.event) {
    case 'join':
    case 'leave':
    case 'pong':
      return { event: parsed.event };
    default:
      return null;
  }
};

export const isValidOpusPacket = (message: Buffer): boolean =>
  message.length > 0 && message.length <= VOICE_PROTOCOL.maxOpusPacketBytes;
