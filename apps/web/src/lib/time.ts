const pad = (value: number) => value.toString().padStart(2, '0');

export function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

export const formatClock = (date: Date = new Date()) => date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
