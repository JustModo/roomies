// Shared utilities for the Chat module

/** Deterministic color per username, readable on dark backgrounds */
export function getUsernameColor(username: string): string {
  let hash = 0;
  for (let i = 0; i < username.length; i++) {
    hash = username.charCodeAt(i) + ((hash << 5) - hash);
  }
  const h = Math.abs(hash) % 360;
  const s = 65 + (Math.abs(hash) % 20);
  const l = 60 + (Math.abs(hash) % 20);
  return `hsl(${h}, ${s}%, ${l}%)`;
}
