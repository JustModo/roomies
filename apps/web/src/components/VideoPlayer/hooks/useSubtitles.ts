import { useState, useEffect, RefObject } from 'react';
import { MediaInfo } from '../../../hooks/useRoomSync';

export const displaySubtitleLabel = (language: string | null): string => {
  if (!language) return 'Unknown';
  try {
    return new Intl.DisplayNames(['en'], { type: 'language' }).of(language) ?? language;
  } catch {
    return language;
  }
};

interface UseSubtitlesProps {
  mediaInfo: MediaInfo | null;
  videoRef: RefObject<HTMLVideoElement>;
}

export function useSubtitles({ mediaInfo, videoRef }: UseSubtitlesProps) {
  const [subtitleUrls, setSubtitleUrls] = useState<Record<string, string>>({});
  const [activeSubtitleId, setActiveSubtitleId] = useState<string | null>(null);

  useEffect(() => {
    setActiveSubtitleId(null);
  }, [mediaInfo?.mediaFileId]);

  useEffect(() => {
    const subtitles = mediaInfo?.subtitles || [];
    if (subtitles.length === 0) {
      setSubtitleUrls({});
      return;
    }

    let cancelled = false;
    const objectUrls: string[] = [];

    Promise.all(subtitles.map(async (sub) => {
      const res = await fetch(`/api/library/subtitles/${sub.id}?offset=${mediaInfo?.transcodeOffset || 0}`, {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
      });
      if (!res.ok) return null;
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      objectUrls.push(url);
      return [sub.id, url] as const;
    })).then((entries) => {
      if (cancelled) return;
      const urls: Record<string, string> = {};
      for (const entry of entries) {
        if (entry) urls[entry[0]] = entry[1];
      }
      setSubtitleUrls(urls);
    }).catch(() => { });

    return () => {
      cancelled = true;
      objectUrls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [mediaInfo?.subtitles, mediaInfo?.transcodeOffset]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    
    // We must wait a tick for the track elements to be mounted before setting mode
    const timeoutId = setTimeout(() => {
      const trackElements = video.querySelectorAll('track');
      trackElements.forEach((trackEl) => {
        if (trackEl.track) {
          trackEl.track.mode = trackEl.id === activeSubtitleId ? 'showing' : 'disabled';
        }
      });
      
      // Ensure any tracks injected by Hls.js (which aren't our managed elements) are disabled
      for (let i = 0; i < video.textTracks.length; i++) {
        const track = video.textTracks[i];
        let isOurTrack = false;
        trackElements.forEach(el => {
          if (el.track === track) isOurTrack = true;
        });
        if (!isOurTrack) {
          track.mode = 'disabled';
        }
      }
    }, 50);

    return () => clearTimeout(timeoutId);
  }, [activeSubtitleId, subtitleUrls, mediaInfo?.subtitles, videoRef]);

  return {
    subtitleUrls,
    activeSubtitleId,
    setActiveSubtitleId,
  };
}
