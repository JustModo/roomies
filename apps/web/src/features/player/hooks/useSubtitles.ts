import { useState, useEffect, useCallback, useRef } from 'react';
import { MediaInfo } from '@roomies/contracts';
import type { SubtitleCue } from '../../../lib/subtitleTypes';
import { parseSubtitleContent } from '../../../lib/subtitleParser';
import { useServices } from '../../../app/ServicesProvider';
import { KEYS } from '../../../services/storage';

const MIN_FONT_SCALE = 0.6;
const MAX_FONT_SCALE = 2.0;
const NO_CUES: SubtitleCue[] = [];

const clampFontScale = (value: number) => Math.min(MAX_FONT_SCALE, Math.max(MIN_FONT_SCALE, value));

export function useSubtitles(mediaInfo: MediaInfo | null) {
  const { api, storage } = useServices();
  const mediaFileId = mediaInfo?.mediaFileId ?? null;

  const [activeSubtitleId, setActiveSubtitleIdState] = useState<string | null>(null);
  const [parsedTracks, setParsedTracks] = useState<Record<string, SubtitleCue[]>>({});
  const [subtitleOffsetSec, setSubtitleOffsetSecState] = useState(0);
  const [subtitleFontScale, setSubtitleFontScaleState] = useState(1);
  const parsedTracksRef = useRef(parsedTracks);

  useEffect(() => {
    parsedTracksRef.current = parsedTracks;
  }, [parsedTracks]);

  const setSubtitleOffsetSec = useCallback(
    (offset: number) => {
      setSubtitleOffsetSecState(offset);
      if (mediaFileId) storage.setJson(KEYS.subtitleOffset(mediaFileId), offset);
    },
    [storage, mediaFileId],
  );

  const setSubtitleFontScale = useCallback(
    (scale: number) => {
      const clamped = clampFontScale(scale);
      setSubtitleFontScaleState(clamped);
      if (mediaFileId) storage.setJson(KEYS.subtitleFontScale(mediaFileId), clamped);
    },
    [storage, mediaFileId],
  );

  const setActiveSubtitleId = useCallback(
    (id: string | null) => {
      setActiveSubtitleIdState(id);
      if (mediaFileId) storage.set(KEYS.subtitleTrack(mediaFileId), id);
    },
    [storage, mediaFileId],
  );

  const subtitlesSignature = (mediaInfo?.subtitles || []).map((s) => s.id).join(',');

  useEffect(() => {
    setParsedTracks({});
    if (!mediaFileId) {
      setSubtitleOffsetSecState(0);
      setSubtitleFontScaleState(1);
      setActiveSubtitleIdState(null);
      return;
    }
    setSubtitleOffsetSecState(storage.getJson(KEYS.subtitleOffset(mediaFileId), 0, Number.isFinite));
    setSubtitleFontScaleState(clampFontScale(storage.getJson(KEYS.subtitleFontScale(mediaFileId), 1, Number.isFinite)));
    const savedId = storage.get(KEYS.subtitleTrack(mediaFileId));
    setActiveSubtitleIdState(savedId && subtitlesSignature.split(',').includes(savedId) ? savedId : null);
  }, [storage, mediaFileId, subtitlesSignature]);

  useEffect(() => {
    if (!activeSubtitleId || parsedTracksRef.current[activeSubtitleId]) return;
    const controller = new AbortController();
    api
      .request<string>(`/library/subtitles/${activeSubtitleId}?offset=0`, { signal: controller.signal })
      .then((text) => setParsedTracks((prev) => ({ ...prev, [activeSubtitleId]: parseSubtitleContent(text) })))
      .catch((err) => {
        if (!controller.signal.aborted) console.error('[subtitles] Failed to load subtitle track:', err);
      });
    return () => controller.abort();
  }, [api, activeSubtitleId]);

  return {
    activeSubtitleId,
    setActiveSubtitleId,
    cues: (activeSubtitleId && parsedTracks[activeSubtitleId]) || NO_CUES,
    subtitleOffsetSec,
    setSubtitleOffsetSec,
    subtitleFontScale,
    setSubtitleFontScale,
  };
}
