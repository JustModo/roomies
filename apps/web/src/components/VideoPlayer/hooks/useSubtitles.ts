import { useState, useEffect, useMemo, useCallback } from 'react';
import { MediaInfo } from '../../../hooks/useRoomSync';

export const displaySubtitleLabel = (language: string | null): string => {
  if (!language) return 'Unknown';
  try {
    return new Intl.DisplayNames(['en'], { type: 'language' }).of(language) ?? language;
  } catch {
    return language;
  }
};

interface ParsedCue {
  startTime: number; // seconds, original (absolute) time
  endTime: number;
  text: string;
}

interface UseSubtitlesProps {
  mediaInfo: MediaInfo | null;
  currentTime: number; // absolute playback time (video.currentTime + transcodeOffset)
}

/** Convert VTT inline tags to safe HTML, preserving <i>, <b>, <u> */
const vttTagToHtml = (text: string): string => {
  return text
    .replace(/<(\/?)(i|b|u)(?:\.[^>]*)?>|<[^>]*>/g, (_m, slash, tag) => {
      if (tag) return `<${slash}${tag}>`;
      return '';
    })
    .replace(/&/g, '&amp;')
    .replace(/\n/g, '<br/>');
};

/** Parse a WebVTT string into an array of cues with absolute timestamps */
const parseVtt = (vttText: string): ParsedCue[] => {
  const cues: ParsedCue[] = [];
  // Split into blocks separated by blank lines
  const blocks = vttText.replace(/\r\n/g, '\n').split(/\n\n+/);

  for (const block of blocks) {
    const lines = block.trim().split('\n');
    // Find the line with the timestamp arrow
    let timestampLineIdx = -1;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes('-->')) {
        timestampLineIdx = i;
        break;
      }
    }
    if (timestampLineIdx === -1) continue;

    const timeParts = lines[timestampLineIdx].split('-->');
    if (timeParts.length < 2) continue;

    const startTime = parseTimestamp(timeParts[0].trim());
    const endTime = parseTimestamp(timeParts[1].trim().split(/\s/)[0]); // strip position metadata

    if (startTime === null || endTime === null) continue;

    // Everything after the timestamp line is cue text
    const text = lines.slice(timestampLineIdx + 1).join('\n');
    if (text.trim()) {
      cues.push({ startTime, endTime, text });
    }
  }

  return cues;
};

/** Parse a VTT/SRT timestamp like "00:01:23.456" or "01:23.456" into seconds */
const parseTimestamp = (ts: string): number | null => {
  // Match HH:MM:SS.mmm or MM:SS.mmm
  const match = ts.match(/(?:(\d+):)?(\d{2}):(\d{2})[.,](\d{3})/);
  if (!match) return null;
  const hours = parseInt(match[1] || '0', 10);
  const minutes = parseInt(match[2], 10);
  const seconds = parseInt(match[3], 10);
  const ms = parseInt(match[4], 10);
  return hours * 3600 + minutes * 60 + seconds + ms / 1000;
};

/** Find active cues for a given time using binary search */
const findActiveCues = (cues: ParsedCue[], time: number): ParsedCue[] => {
  const active: ParsedCue[] = [];
  // Binary search for the first cue that could be active
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
    if (cues[i].startTime > time) break; // past our window
    if (cues[i].startTime <= time && cues[i].endTime > time) {
      active.push(cues[i]);
    }
  }
  return active;
};

export function useSubtitles({ mediaInfo, currentTime }: UseSubtitlesProps) {
  const [activeSubtitleId, setActiveSubtitleId] = useState<string | null>(null);
  // Raw VTT text per subtitle id (fetched once with offset=0)
  const [parsedTracks, setParsedTracks] = useState<Record<string, ParsedCue[]>>({});

  const subtitlesSignature = (mediaInfo?.subtitles || []).map(s => s.id).join(',');

  useEffect(() => {
    if (mediaInfo?.mediaFileId) {
      const savedId = localStorage.getItem(`roomies_subtitle_${mediaInfo.mediaFileId}`);
      // Verify the saved subtitle still exists in the media's subtitle list
      if (savedId && mediaInfo.subtitles?.some(s => s.id === savedId)) {
        setActiveSubtitleId(savedId);
      } else {
        setActiveSubtitleId(null);
      }
    } else {
      setActiveSubtitleId(null);
      setParsedTracks({});
    }
  }, [mediaInfo?.mediaFileId, subtitlesSignature]);

  // Wrapper to save to localStorage whenever the user changes the selection
  const handleSetActiveSubtitleId = useCallback((id: string | null) => {
    setActiveSubtitleId(id);
    if (mediaInfo?.mediaFileId) {
      if (id) {
        localStorage.setItem(`roomies_subtitle_${mediaInfo.mediaFileId}`, id);
      } else {
        localStorage.removeItem(`roomies_subtitle_${mediaInfo.mediaFileId}`);
      }
    }
  }, [mediaInfo?.mediaFileId]);

  // Fetch all subtitle tracks ONCE with offset=0
  useEffect(() => {
    const subtitles = mediaInfo?.subtitles || [];
    if (subtitles.length === 0) {
      setParsedTracks({});
      return;
    }

    let cancelled = false;

    Promise.all(subtitles.map(async (sub) => {
      const res = await fetch(`/api/library/subtitles/${sub.id}?offset=0`, {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
      });
      if (!res.ok) return null;
      const vttText = await res.text();
      const cues = parseVtt(vttText);
      return [sub.id, cues] as const;
    })).then((entries) => {
      if (cancelled) return;
      const tracks: Record<string, ParsedCue[]> = {};
      for (const entry of entries) {
        if (entry) tracks[entry[0]] = entry[1];
      }
      setParsedTracks(tracks);
    }).catch(() => { });

    return () => { cancelled = true; };
  }, [subtitlesSignature]); // use signature to prevent refetch on seek

  // Compute active cue HTML from currentTime — no effects, pure derivation
  const activeCueHtml = useMemo(() => {
    if (!activeSubtitleId) return '';
    const cues = parsedTracks[activeSubtitleId];
    if (!cues || cues.length === 0) return '';

    const active = findActiveCues(cues, currentTime);
    if (active.length === 0) return '';

    return active.map((cue) => vttTagToHtml(cue.text)).join('<br/>');
  }, [activeSubtitleId, parsedTracks, currentTime]);

  return {
    activeSubtitleId,
    setActiveSubtitleId: handleSetActiveSubtitleId,
    activeCueHtml,
  };
}
