import { useState, useEffect, useRef, MutableRefObject } from 'react';
import Hls, { Level, Events, ErrorData, ManifestParsedData, MediaPlaylist } from 'hls.js';
import { MediaInfo, RoomState } from '@roomies/contracts';
import { buildHlsMasterUrl, relativeStartPosition } from '../hlsOffset';

interface NativeAudioTrackList {
  length: number;
  [index: number]: { label?: string; language?: string; enabled: boolean };
}

interface UseHlsPlayerParams {
  videoRef: MutableRefObject<HTMLVideoElement | null>;
  mediaInfo: MediaInfo | null;
  seekKey?: number;
  localTime: number;
  roomPlaybackState?: RoomState['playback'];
  reportStatus: (status: 'ready' | 'buffering') => void;
  setIsPlaying: (playing: boolean) => void;
  isAsyncMode: boolean;
  activeOffsetRef: MutableRefObject<number>;
  onReportResolution?: (resolution: string) => void;
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
  activeOffsetRef,
  onReportResolution,
}: UseHlsPlayerParams) {
  const hlsRef = useRef<Hls | null>(null);
  const [levels, setLevels] = useState<Level[]>([]);
  const [currentLevel, setCurrentLevel] = useState<number>(-1);
  const [activeResolution, setActiveResolution] = useState<string | undefined>();
  /** Index into hls.levels, same ladder in both sync and async now. */
  const preferredLevelRef = useRef<number>(-1);

  const [audioTracks, setAudioTracks] = useState<MediaPlaylist[]>([]);
  const [currentAudioTrack, setCurrentAudioTrack] = useState<number>(-1);
  const mediaFileIdRef = useRef<string | undefined>();
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
      lastMediaIdRef.current = undefined;
      return;
    }

    const isNewMedia = mediaInfo.mediaFileId !== lastMediaIdRef.current;
    lastMediaIdRef.current = mediaInfo.mediaFileId;
    mediaFileIdRef.current = mediaInfo.mediaFileId;

    if (isNewMedia) {
      setLevels([]);
      setCurrentLevel(-1);
      preferredLevelRef.current = -1;
      setAudioTracks([]);
      setCurrentAudioTrack(-1);
    }

    if (Hls.isSupported()) {
      const transcodeOffset = mediaInfo.transcodeOffset || 0;
      activeOffsetRef.current = transcodeOffset;

      const hls = new Hls({
        startPosition: relativeStartPosition(localTime, transcodeOffset),
        startLevel: preferredLevelRef.current >= 0 ? preferredLevelRef.current : -1,
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

      hls.loadSource(buildHlsMasterUrl(mediaInfo.hlsUrl, transcodeOffset));
      hls.attachMedia(videoRef.current);

      hls.on(Events.MANIFEST_PARSED, (_event: Events.MANIFEST_PARSED, data: ManifestParsedData) => {
        setLevels(data.levels);
        if (preferredLevelRef.current !== -1 && preferredLevelRef.current < data.levels.length) {
          hls.currentLevel = preferredLevelRef.current;
        }

        if (hls.audioTracks && hls.audioTracks.length > 1) {
          setAudioTracks([...hls.audioTracks]);
          const saved = mediaFileIdRef.current
            ? localStorage.getItem(`roomies_audio_${mediaFileIdRef.current}`)
            : null;
          if (saved !== null) {
            const preferredIdx = Number(saved);
            if (preferredIdx >= 0 && preferredIdx < hls.audioTracks.length && preferredIdx !== hls.audioTrack) {
              hls.audioTrack = preferredIdx;
              setCurrentAudioTrack(preferredIdx);
            } else {
              setCurrentAudioTrack(hls.audioTrack);
            }
          } else {
            setCurrentAudioTrack(hls.audioTrack);
          }
        }

        if (roomPlaybackState?.state === 'playing') {
          videoRef.current?.play().catch(err => console.error('[playback] Play failed:', err));
          setIsPlaying(true);
        }
      });

      hls.on(Events.AUDIO_TRACKS_UPDATED, () => {
        if (hls.audioTracks && hls.audioTracks.length > 1) {
          setAudioTracks([...hls.audioTracks]);
          setCurrentAudioTrack(hls.audioTrack);
        } else {
          setAudioTracks([]);
          setCurrentAudioTrack(-1);
        }
      });

      hls.on(Events.AUDIO_TRACK_SWITCHED, (_event, data) => {
        const switchedIdx = hls.audioTracks.findIndex(t => t.id === data.id);
        const idx = switchedIdx !== -1 ? switchedIdx : hls.audioTrack;
        setCurrentAudioTrack(idx);
        if (mediaFileIdRef.current) {
          localStorage.setItem(`roomies_audio_${mediaFileIdRef.current}`, String(idx));
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
      const transcodeOffset = mediaInfo.transcodeOffset || 0;
      activeOffsetRef.current = transcodeOffset;

      videoRef.current.src = buildHlsMasterUrl(mediaInfo.hlsUrl, transcodeOffset);
      const targetTime = relativeStartPosition(localTime, transcodeOffset);
      const videoEl = videoRef.current;
      videoEl.addEventListener('loadedmetadata', () => {
        if (videoRef.current) {
          videoRef.current.currentTime = targetTime;
        }

        const nativeTracks = (videoEl as HTMLVideoElement & { audioTracks?: NativeAudioTrackList }).audioTracks;
        if (nativeTracks && nativeTracks.length > 1) {
          const syntheticTracks: MediaPlaylist[] = [];
          for (let i = 0; i < nativeTracks.length; i++) {
            const t = nativeTracks[i];
            syntheticTracks.push({
              id: i,
              name: t.label || t.language || `Track ${i + 1}`,
              lang: t.language || undefined,
              url: '',
              attrs: {} as never,
              bitrate: 0,
              autoselect: i === 0,
              default: i === 0,
              forced: false,
              groupId: 'audio',
              type: 'AUDIO',
              details: undefined,
              audioCodec: undefined,
              videoCodec: undefined,
              unknownCodecs: undefined,
              width: undefined,
              height: undefined,
            });
          }
          setAudioTracks(syntheticTracks);

          const savedId = mediaFileIdRef.current
            ? localStorage.getItem(`roomies_audio_${mediaFileIdRef.current}`)
            : null;
          const preferredIdx = savedId !== null ? Number(savedId) : 0;
          for (let i = 0; i < nativeTracks.length; i++) {
            nativeTracks[i].enabled = i === preferredIdx;
          }
          setCurrentAudioTrack(preferredIdx);
        }

        reportStatus('ready');
      }, { once: true });
    }
  }, [mediaInfo?.mediaFileId, mediaInfo?.transcodeOffset, seekKey, reportStatus, isAsyncMode, onReportResolution]);

  const handleQualityChange = (index: number) => {
    if (hlsRef.current) {
      hlsRef.current.currentLevel = index;
      setCurrentLevel(index);
      preferredLevelRef.current = index;
      if (hlsRef.current.levels && hlsRef.current.levels[index]) {
        const name = hlsRef.current.levels[index].name;
        setActiveResolution(name);
        if (name && onReportResolution) {
          onReportResolution(name);
        }
      }
    }
  };

  const handleAudioTrackChange = (idx: number) => {
    if (hlsRef.current) {
      hlsRef.current.audioTrack = idx;
      setCurrentAudioTrack(idx);
      if (mediaFileIdRef.current) {
        localStorage.setItem(`roomies_audio_${mediaFileIdRef.current}`, String(idx));
      }
    } else {
      const videoEl = videoRef.current as (HTMLVideoElement & { audioTracks?: NativeAudioTrackList }) | null;
      if (videoEl?.audioTracks) {
        for (let i = 0; i < videoEl.audioTracks.length; i++) {
          videoEl.audioTracks[i].enabled = i === idx;
        }
        setCurrentAudioTrack(idx);
        if (mediaFileIdRef.current) {
          localStorage.setItem(`roomies_audio_${mediaFileIdRef.current}`, String(idx));
        }
      }
    }
  };

  return { levels, currentLevel, handleQualityChange, activeResolution, audioTracks, currentAudioTrack, handleAudioTrackChange };
}
