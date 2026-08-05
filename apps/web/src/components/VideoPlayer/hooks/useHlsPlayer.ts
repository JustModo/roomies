import { useState, useEffect, useRef, MutableRefObject } from 'react';
import Hls, { Level, Events, ErrorData, ManifestParsedData, MediaPlaylist } from 'hls.js';
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
  activeOffsetRef,
  triggerQualitySeek,
}: UseHlsPlayerParams) {
  const hlsRef = useRef<Hls | null>(null);
  const [levels, setLevels] = useState<Level[]>([]);
  const [currentLevel, setCurrentLevel] = useState<number>(-1);
  const [activeResolution, setActiveResolution] = useState<string | undefined>();
  const preferredLevelRef = useRef<number>(-1);

  // ── Audio tracks ────────────────────────────────────────────────────────────
  const [audioTracks, setAudioTracks] = useState<MediaPlaylist[]>([]);
  const [currentAudioTrack, setCurrentAudioTrack] = useState<number>(-1);
  // Ref used inside event callbacks to avoid stale closure over mediaInfo
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
      preferredLevelRef.current = -1;
      lastMediaIdRef.current = undefined;
      return;
    }

    const isNewMedia = mediaInfo.mediaFileId !== lastMediaIdRef.current;
    lastMediaIdRef.current = mediaInfo.mediaFileId;
    mediaFileIdRef.current = mediaInfo.mediaFileId;

    // NOTE: Do NOT call reportStatus('buffering') here — useVideoEvents handles
    // the buffering/ready lifecycle via DOM events (waiting, canplay, seeked, progress).
    // Calling it here causes a double-report and confuses the reconcile flow.
    if (isNewMedia) {
      setLevels([]);
      setCurrentLevel(-1);
      preferredLevelRef.current = -1;
      setAudioTracks([]);
      setCurrentAudioTrack(-1);
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

        // Populate audio tracks and restore persisted preference.
        // NOTE: hls.audioTrack is an INDEX (0-based) into hls.audioTracks[], NOT a MediaPlaylist.id.
        // We track currentAudioTrack as that index throughout.
        if (hls.audioTracks && hls.audioTracks.length > 1) {
          setAudioTracks([...hls.audioTracks]);
          const saved = mediaFileIdRef.current
            ? localStorage.getItem(`roomies_audio_${mediaFileIdRef.current}`)
            : null;
          if (saved !== null) {
            const preferredIdx = Number(saved);
            if (preferredIdx >= 0 && preferredIdx < hls.audioTracks.length && preferredIdx !== hls.audioTrack) {
              // Only switch if the saved preference differs from hls.js's default — avoids
              // a spurious audio reload that triggers 'waiting' → buffering in async mode.
              hls.audioTrack = preferredIdx;
              setCurrentAudioTrack(preferredIdx);
            } else {
              setCurrentAudioTrack(hls.audioTrack);
            }
          } else {
            setCurrentAudioTrack(hls.audioTrack); // hls.audioTrack is already an index
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
          setCurrentAudioTrack(hls.audioTrack); // index
        } else {
          setAudioTracks([]);
          setCurrentAudioTrack(-1);
        }
      });

      hls.on(Events.AUDIO_TRACK_SWITCHED, (_event, data) => {
        // data extends MediaPlaylist, so data.id is the MediaPlaylist.id — NOT the index.
        // Find the index so currentAudioTrack stays index-based throughout.
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
      const videoEl = videoRef.current;
      videoEl.addEventListener('loadedmetadata', () => {
        if (videoRef.current) {
          videoRef.current.currentTime = targetTime;
        }

        // Safari native audio track list
        const nativeTracks = (videoEl as HTMLVideoElement & { audioTracks?: AudioTrackList }).audioTracks;
        if (nativeTracks && nativeTracks.length > 1) {
          // Build a minimal MediaPlaylist-like array for the UI
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

          // Restore persisted preference
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
  }, [mediaInfo?.mediaFileId, seekKey, reportStatus]);

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

  // idx = 0-based index into audioTracks[]. hls.audioTrack getter/setter works by index.
  const handleAudioTrackChange = (idx: number) => {
    if (hlsRef.current) {
      // Pure client-side hls.js switch — no loadSource/reload, no server round-trip.
      // Only new audio segments are fetched; the video buffer is untouched.
      hlsRef.current.audioTrack = idx;
      setCurrentAudioTrack(idx);
      if (mediaFileIdRef.current) {
        localStorage.setItem(`roomies_audio_${mediaFileIdRef.current}`, String(idx));
      }
    } else {
      // Safari native HLS fallback
      const videoEl = videoRef.current as (HTMLVideoElement & { audioTracks?: AudioTrackList }) | null;
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
