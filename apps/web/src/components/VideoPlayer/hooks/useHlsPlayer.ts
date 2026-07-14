import { useState, useEffect, useRef, MutableRefObject } from 'react';
import Hls, { Level, Events, ErrorData, ManifestParsedData } from 'hls.js';
import { MediaInfo, RoomState } from '../../../hooks/useRoomSync';

interface UseHlsPlayerParams {
  videoRef: MutableRefObject<HTMLVideoElement | null>;
  mediaInfo: MediaInfo | null;
  seekKey?: number;
  localTime: number;
  roomPlaybackState?: RoomState['playback'];
  reportStatus: (status: 'ready' | 'buffering') => void;
  setIsPlaying: (playing: boolean) => void;
  isAsyncMode: boolean;
}

export function useHlsPlayer({
  videoRef,
  mediaInfo,
  seekKey,
  localTime,
  roomPlaybackState,
  reportStatus,
  setIsPlaying,
  isAsyncMode,
}: UseHlsPlayerParams) {
  const hlsRef = useRef<Hls | null>(null);
  const [levels, setLevels] = useState<Level[]>([]);
  const [currentLevel, setCurrentLevel] = useState<number>(-1);

  useEffect(() => {
    if (!videoRef.current) return;

    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }
    videoRef.current.removeAttribute('src');
    videoRef.current.load();

    if (!mediaInfo?.hlsUrl) {
      setLevels([]);
      setCurrentLevel(-1);
      return;
    }

    reportStatus('buffering');
    setLevels([]);
    setCurrentLevel(-1);

    if (Hls.isSupported()) {
      const transcodeOffset = mediaInfo.transcodeOffset || 0;
      let targetOffset = transcodeOffset;
      if (isAsyncMode) {
        targetOffset = Math.max(0, Math.floor(localTime / 10) * 10 - 10);
      }
      
      const hls = new Hls({
        startPosition: Math.max(0, localTime - targetOffset),
        enableWorker: true,
        lowLatencyMode: false,
        manifestLoadingMaxRetry: 10,
        manifestLoadingRetryDelay: 1000,
        levelLoadingMaxRetry: 10,
        levelLoadingRetryDelay: 1000,
        fragLoadingMaxRetry: 10,
        fragLoadingRetryDelay: 1000,
        maxBufferLength: 60,
        maxMaxBufferLength: 120,
      });

      const hlsUrl = new URL(mediaInfo.hlsUrl, window.location.origin);
      hlsUrl.searchParams.set('t', Date.now().toString());
      if (isAsyncMode && targetOffset !== transcodeOffset) {
        hlsUrl.searchParams.set('offset', targetOffset.toString());
      }

      hls.loadSource(hlsUrl.toString());
      hls.attachMedia(videoRef.current);

      hls.on(Events.MANIFEST_PARSED, (_event: Events.MANIFEST_PARSED, data: ManifestParsedData) => {
        setLevels(data.levels);
        if (roomPlaybackState?.state === 'playing') {
          videoRef.current?.play().catch(err => console.error('[playback] Play failed:', err));
          setIsPlaying(true);
        }
      });

      hls.on(Events.LEVEL_SWITCHED, () => {
        setCurrentLevel(hls.autoLevelEnabled ? -1 : hls.currentLevel);
      });

      hls.on(Events.ERROR, (_event: Events.ERROR, data: ErrorData) => {
        if (data.fatal) {
          console.error('[playback] HLS fatal error:', data.type, data.details);
          if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
            hls.startLoad(videoRef.current?.currentTime ?? -1);
          } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
            hls.recoverMediaError();
          }
        }
      });

      hlsRef.current = hls;

      return () => {
        hls.destroy();
        hlsRef.current = null;
      };
    } else if (videoRef.current.canPlayType('application/vnd.apple.mpegurl')) {
      const transcodeOffset = mediaInfo.transcodeOffset || 0;
      let targetOffset = transcodeOffset;
      if (isAsyncMode) {
        targetOffset = Math.max(0, Math.floor(localTime / 10) * 10 - 10);
      }

      const hlsUrl = new URL(mediaInfo.hlsUrl, window.location.origin);
      if (isAsyncMode && targetOffset !== transcodeOffset) {
        hlsUrl.searchParams.set('offset', targetOffset.toString());
      }

      videoRef.current.src = hlsUrl.toString();
      const targetTime = Math.max(0, localTime - targetOffset);
      videoRef.current.addEventListener('loadedmetadata', () => {
        if (videoRef.current) {
          videoRef.current.currentTime = targetTime;
        }
        reportStatus('ready');
      }, { once: true });
    }
  }, [mediaInfo?.hlsUrl, seekKey, reportStatus]);

  const handleQualityChange = (index: number) => {
    if (hlsRef.current) {
      hlsRef.current.currentLevel = index;
      setCurrentLevel(index);
    }
  };

  return { levels, currentLevel, handleQualityChange };
}
