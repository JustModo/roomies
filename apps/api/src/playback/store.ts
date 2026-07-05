export interface PlaybackState {
  partyId: string;
  currentMovieId: string;
  leaderId: string;
  position: number; // in seconds
  speed: number;
  isPaused: boolean;
  subtitleTrack: string;
  audioTrack: string;
  updatedAt: number;
}

// Single-node, in-memory replacement for the old Redis OM playbackState
// schema. The app only ever supports one globally active party, so a single
// module-level variable is sufficient — no persistence across restarts, same
// as the Redis-backed version provided (nothing snapshotted it to the DB).
let currentState: PlaybackState | null = {
  partyId: 'main',
  currentMovieId: '',
  leaderId: 'system',
  position: 0,
  speed: 1,
  isPaused: true,
  subtitleTrack: '',
  audioTrack: '',
  updatedAt: Date.now(),
};

export const playbackStateStore = {
  get(): PlaybackState | null {
    return currentState;
  },

  getByPartyId(partyId: string): PlaybackState | null {
    return currentState && currentState.partyId === partyId ? currentState : null;
  },

  set(state: PlaybackState): void {
    currentState = state;
  },

  clear(): void {
    currentState = null;
  },
};
