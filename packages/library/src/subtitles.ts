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

export interface ParsedAssTag {
  alignment: number;
  primaryColor: string | null;
  isBold: boolean;
  isItalic: boolean;
  position: { x: number; y: number } | null;
  cleanText: string;
}

export function parseAssDialogueTag(text: string): ParsedAssTag {
  let alignment = 2; // Default bottom-center
  let primaryColor: string | null = null;
  let isBold = false;
  let isItalic = false;
  let position: { x: number; y: number } | null = null;

  // Extract alignment \an<1-9>
  const anMatch = text.match(/\\an([1-9])/);
  if (anMatch) {
    alignment = parseInt(anMatch[1], 10);
  }

  // Extract ASS color \c&HBBGGRR& or \1c&HBBGGRR&
  const colorMatch = text.match(/\\(?:c|1c)&H([0-9A-Fa-f]{6})&?/);
  if (colorMatch) {
    const bgr = colorMatch[1];
    const r = bgr.substring(4, 6);
    const g = bgr.substring(2, 4);
    const b = bgr.substring(0, 2);
    primaryColor = `#${r}${g}${b}`.toUpperCase();
  }

  if (text.includes('\\b1')) isBold = true;
  if (text.includes('\\i1')) isItalic = true;

  const posMatch = text.match(/\\pos\(\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)\s*\)/);
  if (posMatch) {
    position = { x: parseFloat(posMatch[1]), y: parseFloat(posMatch[2]) };
  }

  // Clean override tag blocks for raw text
  const cleanText = text.replace(/\{[^}]*\}/g, '').replace(/\\N/g, '\n').trim();

  return { alignment, primaryColor, isBold, isItalic, position, cleanText };
}

