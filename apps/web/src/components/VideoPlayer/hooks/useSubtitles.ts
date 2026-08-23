import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { MediaInfo } from '@roomies/contracts';
import type { SubtitleCue } from '../types/subtitle.ts';
import { parseSubtitleContent } from '../utils/subtitleParser.ts';

const capitalize = (str: string): string => {
  try {
    const formatted = new Intl.DisplayNames(['en'], { type: 'language' }).of(str) ?? str;
    return formatted.charAt(0).toUpperCase() + formatted.slice(1);
  } catch {
    return str.charAt(0).toUpperCase() + str.slice(1);
  }
};

export const displaySubtitleLabel = (language: string | null): string => {
  if (!language || language.toLowerCase() === 'external') return 'External';

  if (language.toLowerCase().startsWith('external:')) {
    const name = language.slice(9).trim();
    return name ? `${capitalize(name)} External` : 'External';
  }

  return capitalize(language.trim());
};

interface UseSubtitlesProps {
  mediaInfo: MediaInfo | null;
  currentTime: number; // absolute playback time (video.currentTime + transcodeOffset)
}

// Keyed per media file, like the track selection below: a sync offset calibrated for one rip
// is wrong for the next title, so a new media file must start from the defaults.
const OFFSET_STORAGE_PREFIX = 'roomies_subtitle_offset_';
const FONT_SCALE_STORAGE_PREFIX = 'roomies_subtitle_font_scale_';
const MIN_FONT_SCALE = 0.6;
const MAX_FONT_SCALE = 2.0;

const clampFontScale = (value: number) => Math.min(MAX_FONT_SCALE, Math.max(MIN_FONT_SCALE, value));

const readStoredNumber = (key: string | null, fallback: number): number => {
  if (!key) return fallback;
  const saved = parseFloat(localStorage.getItem(key) || '');
  return isNaN(saved) ? fallback : saved;
};

/** Find active cues for a given time using binary search */
const findActiveCues = (cues: SubtitleCue[], time: number): SubtitleCue[] => {
  const active: SubtitleCue[] = [];
  let lo = 0;
  let hi = cues.length - 1;

  // Find leftmost cue where endTime > time
  while (lo <= hi) {
    const mid = (lo + hi) >>> 1;
    if (cues[mid].endTime <= time) {
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }

  // From 'lo' onward, check cues that start before 'time'
  for (let i = lo; i < cues.length; i++) {
    if (cues[i].startTime > time) break;
    if (cues[i].startTime <= time && cues[i].endTime > time) {
      active.push(cues[i]);
    }
  }
  return active;
};

export function useSubtitles({ mediaInfo, currentTime }: UseSubtitlesProps) {
  const mediaFileId = mediaInfo?.mediaFileId ?? null;
  const offsetKey = mediaFileId && `${OFFSET_STORAGE_PREFIX}${mediaFileId}`;
  const fontScaleKey = mediaFileId && `${FONT_SCALE_STORAGE_PREFIX}${mediaFileId}`;

  const [activeSubtitleId, setActiveSubtitleId] = useState<string | null>(null);
  const [parsedTracks, setParsedTracks] = useState<Record<string, SubtitleCue[]>>({});

  const [subtitleOffsetSec, setSubtitleOffsetSecState] = useState(0);
  const [subtitleFontScale, setSubtitleFontScaleState] = useState(1);

  const setSubtitleOffsetSec = useCallback((offset: number) => {
    setSubtitleOffsetSecState(offset);
    if (offsetKey) localStorage.setItem(offsetKey, String(offset));
  }, [offsetKey]);

  const setSubtitleFontScale = useCallback((scale: number) => {
    const clamped = clampFontScale(scale);
    setSubtitleFontScaleState(clamped);
    if (fontScaleKey) localStorage.setItem(fontScaleKey, String(clamped));
  }, [fontScaleKey]);

  const subtitlesSignature = (mediaInfo?.subtitles || []).map(s => s.id).join(',');

  useEffect(() => {
    setParsedTracks({});
    setSubtitleOffsetSecState(readStoredNumber(offsetKey, 0));
    setSubtitleFontScaleState(clampFontScale(readStoredNumber(fontScaleKey, 1)));
    if (mediaFileId) {
      const savedId = localStorage.getItem(`roomies_subtitle_${mediaFileId}`);
      if (savedId && mediaInfo?.subtitles?.some(s => s.id === savedId)) {
        setActiveSubtitleId(savedId);
      } else {
        setActiveSubtitleId(null);
      }
    } else {
      setActiveSubtitleId(null);
    }
  }, [mediaFileId, subtitlesSignature]);

  const handleSetActiveSubtitleId = useCallback((id: string | null) => {
    setActiveSubtitleId(id);
    if (mediaFileId) {
      if (id) {
        localStorage.setItem(`roomies_subtitle_${mediaFileId}`, id);
      } else {
        localStorage.removeItem(`roomies_subtitle_${mediaFileId}`);
      }
    }
  }, [mediaFileId]);

  // Fetch only the selected track, and only once (cached in parsedTracks thereafter).
  const parsedTracksRef = useRef(parsedTracks);
  parsedTracksRef.current = parsedTracks;

  useEffect(() => {
    if (!activeSubtitleId || parsedTracksRef.current[activeSubtitleId]) return;

    let cancelled = false;

    fetch(`/api/library/subtitles/${activeSubtitleId}?offset=0`, {
      headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
    }).then(async (res) => {
      if (!res.ok || cancelled) return;
      const text = await res.text();
      const cues = parseSubtitleContent(text);
      if (cancelled) return;
      setParsedTracks((prev) => ({ ...prev, [activeSubtitleId]: cues }));
    }).catch(() => { });

    return () => { cancelled = true; };
  }, [activeSubtitleId]);

  const activeCues = useMemo(() => {
    if (!activeSubtitleId) return [];
    const cues = parsedTracks[activeSubtitleId];
    if (!cues || cues.length === 0) return [];

    return findActiveCues(cues, currentTime + subtitleOffsetSec);
  }, [activeSubtitleId, parsedTracks, currentTime, subtitleOffsetSec]);

  return {
    activeSubtitleId,
    setActiveSubtitleId: handleSetActiveSubtitleId,
    activeCues,
    subtitleOffsetSec,
    setSubtitleOffsetSec,
    subtitleFontScale,
    setSubtitleFontScale,
  };
}
