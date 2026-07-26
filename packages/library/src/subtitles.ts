const TIMESTAMP_RE = /(?:(\d{1,2}):)?(\d{2}):(\d{2})[.,](\d{1,4})/g;

const parseMsToken = (msStr: string): number => {
  if (msStr.length === 1) return parseInt(msStr, 10) * 100;
  if (msStr.length === 2) return parseInt(msStr, 10) * 10;
  if (msStr.length === 3) return parseInt(msStr, 10);
  return parseInt(msStr.slice(0, 3), 10);
};

const toMs = (h: string | undefined, m: string, s: string, ms: string): number => {
  const hours = h ? parseInt(h, 10) : 0;
  const minutes = parseInt(m, 10);
  const seconds = parseInt(s, 10);
  const milliseconds = parseMsToken(ms);
  return (((hours * 60 + minutes) * 60 + seconds) * 1000) + milliseconds;
};

const fromMs = (value: number): string => {
  const clamped = Math.max(0, Math.round(value));
  const ms = clamped % 1000;
  const totalSeconds = Math.floor(clamped / 1000);
  const s = totalSeconds % 60;
  const totalMinutes = Math.floor(totalSeconds / 60);
  const m = totalMinutes % 60;
  const h = Math.floor(totalMinutes / 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(ms).padStart(3, '0')}`;
};

/** Converts SRT or VTT subtitle content into valid WebVTT, shifting every cue timestamp by -offsetSeconds (clamped to 0). */
export const convertSubtitleToVtt = (content: string, offsetSeconds = 0): string => {
  const normalized = content.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n');
  const offsetMs = Math.round(offsetSeconds * 1000);

  const shifted = normalized.replace(TIMESTAMP_RE, (_match, h, m, s, ms) => fromMs(toMs(h, m, s, ms) - offsetMs));

  const trimmed = shifted.trim();
  return trimmed.startsWith('WEBVTT') ? `${trimmed}\n` : `WEBVTT\n\n${trimmed}\n`;
};
