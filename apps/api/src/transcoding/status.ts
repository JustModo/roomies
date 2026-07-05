export type TranscodeStatus = 'pending' | 'processing' | 'ready' | 'failed';

const STATUS_TTL_MS = 24 * 60 * 60 * 1000; // 24h, matching the old Redis EX

// Single-node, in-memory replacement for the old `redis.set(key, status, {EX})`
// transcode-status key. Each entry expires on its own timer, same lifetime as
// the Redis-backed version.
const statusByPartyId = new Map<string, TranscodeStatus>();
const expiryTimers = new Map<string, NodeJS.Timeout>();

export const setTranscodeStatus = (partyId: string, status: TranscodeStatus): void => {
  statusByPartyId.set(partyId, status);

  const existingTimer = expiryTimers.get(partyId);
  if (existingTimer) clearTimeout(existingTimer);

  const timer = setTimeout(() => {
    statusByPartyId.delete(partyId);
    expiryTimers.delete(partyId);
  }, STATUS_TTL_MS);
  timer.unref();
  expiryTimers.set(partyId, timer);
};

export const getTranscodeStatus = (partyId: string): TranscodeStatus | undefined => {
  return statusByPartyId.get(partyId);
};
