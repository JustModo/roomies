export const PLAYBACK_RATES = [0.5, 1, 1.25, 1.5, 2];

export const nextPlaybackRate = (current: number): number =>
  PLAYBACK_RATES.find((rate) => rate > current) ?? PLAYBACK_RATES[0];
