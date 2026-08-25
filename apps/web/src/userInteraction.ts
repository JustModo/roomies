/**
 * Set on the lobby's JOIN click; Room refuses to mount without it so autoplay
 * always happens inside a real gesture. Lives outside Room.tsx so the lobby
 * does not have to pull Room's whole graph (hls.js, opus/rnnoise wasm, emoji
 * picker — ~1.4 MB) just to flip a boolean. Loading that on / was enough to
 * blank the page on memory-constrained iPads.
 */
export let hasUserInteracted = false;

export const setHasUserInteracted = (val: boolean) => {
  hasUserInteracted = val;
};
