import path from 'path';
import type { ScannedSubtitle } from '../types';

const stem = (name: string): string => path.basename(name, path.extname(name)).toLowerCase();

/** Alias table mapping common language tokens (found in sidecar filenames) to a normalized ISO-639-1 code. */
const LANGUAGE_ALIASES: Record<string, string> = {
  en: 'en', eng: 'en', english: 'en',
  fr: 'fr', fre: 'fr', fra: 'fr', french: 'fr',
  es: 'es', spa: 'es', spanish: 'es',
  de: 'de', ger: 'de', deu: 'de', german: 'de',
  it: 'it', ita: 'it', italian: 'it',
  pt: 'pt', por: 'pt', portuguese: 'pt', pob: 'pt', pb: 'pt',
  ru: 'ru', rus: 'ru', russian: 'ru',
  ja: 'ja', jpn: 'ja', japanese: 'ja',
  ko: 'ko', kor: 'ko', korean: 'ko',
  zh: 'zh', chi: 'zh', zho: 'zh', chinese: 'zh', chs: 'zh', cht: 'zh',
  ar: 'ar', ara: 'ar', arabic: 'ar',
  hi: 'hi', hin: 'hi', hindi: 'hi',
  nl: 'nl', dut: 'nl', nld: 'nl', dutch: 'nl',
  pl: 'pl', pol: 'pl', polish: 'pl',
  tr: 'tr', tur: 'tr', turkish: 'tr',
  uk: 'uk', ukr: 'uk', ukrainian: 'uk',
  sv: 'sv', swe: 'sv', swedish: 'sv',
  no: 'no', nor: 'no', norwegian: 'no',
  da: 'da', dan: 'da', danish: 'da',
  fi: 'fi', fin: 'fi', finnish: 'fi',
  cs: 'cs', cze: 'cs', ces: 'cs', czech: 'cs',
  el: 'el', gre: 'el', ell: 'el', greek: 'el',
  he: 'he', heb: 'he', hebrew: 'he',
  id: 'id', ind: 'id', indonesian: 'id',
  vi: 'vi', vie: 'vi', vietnamese: 'vi',
  th: 'th', tha: 'th', thai: 'th',
};

export const extractLanguageToken = (remaining: string): string | null => {
  const parts = remaining.split(/[._\ \-]+/).filter(Boolean);
  for (const part of parts) {
    const lower = part.toLowerCase();
    if (LANGUAGE_ALIASES[lower]) {
      return LANGUAGE_ALIASES[lower];
    }
    const base = lower.split(/[-_]/)[0];
    if (LANGUAGE_ALIASES[base]) {
      return LANGUAGE_ALIASES[base];
    }
  }
  return null;
};

/** Matches all sidecar subtitle files for a video: exact stem match (language unknown), or stem + separator + a recognized language token. */
export const matchSubtitles = (videoPath: string, subtitlePaths: string[]): ScannedSubtitle[] => {
  const videoStem = stem(videoPath);
  const matches: ScannedSubtitle[] = [];

  for (const subPath of subtitlePaths) {
    const subStem = stem(subPath);
    if (subStem === videoStem) {
      matches.push({ path: subPath, language: null });
      continue;
    }

    if (subStem.startsWith(videoStem)) {
      const rest = subStem.slice(videoStem.length);
      if (/^[\s._-]+/.test(rest)) {
        const remaining = rest.replace(/^[\s._-]+/, '');
        const language = extractLanguageToken(remaining);
        if (language) {
          matches.push({ path: subPath, language });
        }
      }
    }
  }

  return matches;
};
