import { useState, useEffect, useRef, MutableRefObject } from 'react';
import Hls, { Level, Events, ErrorData, ManifestParsedData } from 'hls.js';
import { MediaInfo, RoomState } from '@roomies/contracts';

interface UseHlsPlayerParams {
  videoRef: MutableRefObject<HTMLVideoElement | null>;
  mediaInfo: MediaInfo | null;
  seekKey?: number;
  localTime: number;
  roomPlaybackState?: RoomState['playback'];
  reportStatus: (status: 'ready' | 'buffering') => void;
  setIsPlaying: (playing: boolean) => void;
  isAsyncMode: boolean;
  userId?: string;
  activeOffsetRef: MutableRefObject<number>;
  triggerQualitySeek: () => void;
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
  userId,
  activeOffsetRef,
  triggerQualitySeek,
}: UseHlsPlayerParams) {
  const hlsRef = useRef<Hls | null>(null);
  const [levels, setLevels] = useState<Level[]>([]);
  const [currentLevel, setCurrentLevel] = useState<number>(-1);
  const [activeResolution, setActiveResolution] = useState<string | undefined>();
  const preferredLevelRef = useRef<number>(-1);

  const lastMediaIdRef = useRef<string | undefined>();

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
      preferredLevelRef.current = -1;
      lastMediaIdRef.current = undefined;
      return;
    }

    const isNewMedia = mediaInfo.mediaFileId !== lastMediaIdRef.current;
    lastMediaIdRef.current = mediaInfo.mediaFileId;

    // NOTE: Do NOT call reportStatus('buffering') here — useVideoEvents handles
    // the buffering/ready lifecycle via DOM events (waiting, canplay, seeked, progress).
    // Calling it here causes a double-report and confuses the reconcile flow.
    if (isNewMedia) {
      setLevels([]);
      setCurrentLevel(-1);
      preferredLevelRef.current = -1;
    }

    if (Hls.isSupported()) {
      // Unified offset: always use server-provided transcodeOffset.
      // No more client-side Math.floor(localTime / 10) * 10 computation.
      const transcodeOffset = mediaInfo.transcodeOffset || 0;
      activeOffsetRef.current = transcodeOffset;

      const hls = new Hls({
        startPosition: Math.max(0, localTime - transcodeOffset),
        enableWorker: true,
        lowLatencyMode: false,
        manifestLoadingMaxRetry: 10,
        manifestLoadingRetryDelay: 1000,
        levelLoadingMaxRetry: 10,
        levelLoadingRetryDelay: 1000,
        fragLoadingMaxRetry: 10,
        fragLoadingRetryDelay: 1000,
        maxBufferLength: 30,
        maxMaxBufferLength: 60,
        backBufferLength: 15,
      });

      const baseUrl = mediaInfo.hlsUrl;
      const hlsUrl = new URL(baseUrl, window.location.origin);
      hlsUrl.searchParams.set('t', Date.now().toString());
      if (transcodeOffset > 0) {
        hlsUrl.searchParams.set('offset', transcodeOffset.toString());
      }

      hls.loadSource(hlsUrl.toString());
      hls.attachMedia(videoRef.current);

      hls.on(Events.MANIFEST_PARSED, (_event: Events.MANIFEST_PARSED, data: ManifestParsedData) => {
        setLevels(data.levels);

        if (preferredLevelRef.current !== -1 && preferredLevelRef.current < data.levels.length) {
          hls.currentLevel = preferredLevelRef.current;
        }

        if (roomPlaybackState?.state === 'playing') {
          videoRef.current?.play().catch(err => console.error('[playback] Play failed:', err));
          setIsPlaying(true);
        }
      });

      hls.on(Events.LEVEL_SWITCHED, (_event: Events.LEVEL_SWITCHED, data) => {
        setCurrentLevel(hls.autoLevelEnabled ? -1 : data.level);
        if (hls.levels && hls.levels[data.level]) {
          setActiveResolution(hls.levels[data.level].name);
        }
      });

      hls.on(Events.FRAG_LOADING, (_event, data) => {
        const levelIndex = data.frag.level;
        if (hls.levels && hls.levels[levelIndex]) {
          setActiveResolution(hls.levels[levelIndex].name);
        }
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
      // Native HLS (Safari): same unified offset logic.
      const transcodeOffset = mediaInfo.transcodeOffset || 0;
      activeOffsetRef.current = transcodeOffset;

      const baseUrl = mediaInfo.hlsUrl;
      const hlsUrl = new URL(baseUrl, window.location.origin);
      if (transcodeOffset > 0) {
        hlsUrl.searchParams.set('offset', transcodeOffset.toString());
      }

      videoRef.current.src = hlsUrl.toString();
      const targetTime = Math.max(0, localTime - transcodeOffset);
      videoRef.current.addEventListener('loadedmetadata', () => {
        if (videoRef.current) {
          videoRef.current.currentTime = targetTime;
        }
        reportStatus('ready');
      }, { once: true });
    }
  }, [mediaInfo?.mediaFileId, seekKey, reportStatus, isAsyncMode, userId]);

  const handleQualityChange = (index: number) => {
    if (hlsRef.current) {
      hlsRef.current.currentLevel = index;
      setCurrentLevel(index);
      preferredLevelRef.current = index;
      if (hlsRef.current.levels && hlsRef.current.levels[index]) {
        setActiveResolution(hlsRef.current.levels[index].name);
      }

      // NOTE: In sync mode, all 3 variants are actively running and perfectly aligned,
      // so HLS.js can seamlessly switch natively. We only need to force a hard seek 
      // in async mode, where unused variants are suspended and left behind!
      if (isAsyncMode) {
        triggerQualitySeek();
      }
    }
  };

  return { levels, currentLevel, handleQualityChange, activeResolution };
}
