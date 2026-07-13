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
}

export function useHlsPlayer({
  videoRef,
  mediaInfo,
  seekKey,
  localTime,
  roomPlaybackState,
  reportStatus,
  setIsPlaying,
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
      const hls = new Hls({
        startPosition: localTime > 0 ? Math.max(0, localTime - (mediaInfo.transcodeOffset || 0)) : undefined,
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

      hls.loadSource(`${mediaInfo.hlsUrl}?t=${Date.now()}`);
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
      videoRef.current.src = mediaInfo.hlsUrl;
      videoRef.current.currentTime = Math.max(0, localTime - (mediaInfo.transcodeOffset || 0));
      videoRef.current.addEventListener('loadedmetadata', () => {
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
