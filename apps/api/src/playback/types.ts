// ── Session Scope ──────────────────────────────────────────────────────

/** Discriminated union identifying who a playback session belongs to. */
export type SessionScope =
  | { type: 'room' }
  | { type: 'user'; userId: string };

/** Convert a SessionScope to the string key used by TranscodeSessionManager. */
export function sessionScopeToId(scope: SessionScope): string {
  return scope.type === 'room' ? 'sync' : 'async';
}
