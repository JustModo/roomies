import { useState, useEffect, useRef, useCallback } from 'react';
import { useWebSocket } from './useWebSocket';
import { RoomState, MediaInfo, SyncStatus } from '@roomies/contracts';
import { useAsyncPlayback } from './useAsyncPlayback';
import { SeekCommand } from '../components/VideoPlayer/types';

export function useRoomSync() {
  const { isConnected, sendMessage, addMessageHandler } = useWebSocket();
  const [roomState, setRoomState] = useState<RoomState | null>(null);
  const [mediaInfo, setMediaInfo] = useState<MediaInfo | null>(null);
  const hasInitializedRef = useRef(false);

  const [localTime, setLocalTime] = useState(0);
  const [localCorrectionRate, setLocalCorrectionRate] = useState<number | null>(null);
  const localTimeRef = useRef(0);
  const correctionTimeoutRef = useRef<ReturnType<typeof setTimeout>>();

  // Single seek command object — VideoPlayer deduplicates by id.
  const seekIdRef = useRef(0);
  const [seekCommand, setSeekCommand] = useState<SeekCommand | null>(null);

  const smoothedPingRef = useRef<number>();
  const pingQualityRef = useRef<number>(0);
  const consecutivePingRef = useRef<{ tier: number; count: number }>({ tier: 0, count: 0 });
  const activeResolutionRef = useRef<string | undefined>();
  const localStatusRef = useRef<SyncStatus>('ready');

  // Refs for values used in intervals/callbacks that must stay fresh.
  const playbackStateRef = useRef<RoomState['playback']['state']>();
  const playbackRateRef = useRef<number>();
  const activeRateRef = useRef(1);

  const asyncPlayback = useAsyncPlayback({
    isConnected,
    sendMessage,
    localTimeRef,
    activeResolutionRef,
    roomPlaybackState: roomState?.playback,
    allowAsyncMode: roomState?.settings?.allowAsyncMode ?? true,
  });

  // ── Helpers ────────────────────────────────────────────────────────────────

  /** Compute the current expected playback position from an anchor. */
  const getPositionFromAnchor = useCallback((playback: RoomState['playback']): number => {
    let pos = playback.anchorPosition;
    if (playback.state === 'playing') {
      const elapsed = (Date.now() - playback.anchorTime) / 1000;
      pos += elapsed * playback.playbackRate;
    }
    return pos;
  }, []);

  /** Issue a new seek command, monotonically incrementing the id. */
  const issueSeekCommand = useCallback((position: number) => {
    seekIdRef.current += 1;
    setSeekCommand({ position, id: seekIdRef.current });
  }, []);

  // ── Async mode transitions ─────────────────────────────────────────────────

  const prevIsAsyncMode = useRef(asyncPlayback.isAsyncMode);
  useEffect(() => {
    const wasAsync = prevIsAsyncMode.current;
    prevIsAsyncMode.current = asyncPlayback.isAsyncMode;

    if (wasAsync && !asyncPlayback.isAsyncMode && roomState) {
      // Exiting async: snap video to current room position.
      const pos = getPositionFromAnchor(roomState.playback);
      setLocalTime(pos);
      localTimeRef.current = pos;
      issueSeekCommand(pos);
    }
  }, [asyncPlayback.isAsyncMode, roomState, getPositionFromAnchor, issueSeekCommand]);

  // ── Clear soft correction on room rate change or entering async ─────────────

  const prevPlaybackRateRef = useRef(roomState?.playback.playbackRate);
  useEffect(() => {
    if (roomState?.playback.playbackRate !== prevPlaybackRateRef.current) {
      setLocalCorrectionRate(null);
      if (correctionTimeoutRef.current) clearTimeout(correctionTimeoutRef.current);
    }
    prevPlaybackRateRef.current = roomState?.playback.playbackRate;
  }, [roomState?.playback.playbackRate]);

  useEffect(() => {
    if (asyncPlayback.isAsyncMode) {
      setLocalCorrectionRate(null);
      if (correctionTimeoutRef.current) clearTimeout(correctionTimeoutRef.current);
    }
  }, [asyncPlayback.isAsyncMode]);

  // Keep rate refs in sync.
  useEffect(() => {
    playbackStateRef.current = roomState?.playback.state;
    playbackRateRef.current = roomState?.playback.playbackRate;
    activeRateRef.current = localCorrectionRate ?? roomState?.playback.playbackRate ?? 1;
  }, [roomState?.playback.state, roomState?.playback.playbackRate, localCorrectionRate]);

  // ── Message Handler ────────────────────────────────────────────────────────

  useEffect(() => {
    const remove = addMessageHandler((msg) => {

      // ── room.state (initial join or reconnect) ─────────────────────────
      if (msg.event === 'room.state') {
        const room = msg.payload.room;
        if (!room.mediaId) room.playback.state = 'waiting';
        setRoomState(room);

        if (!hasInitializedRef.current && !asyncPlayback.isAsyncModeRef.current) {
          hasInitializedRef.current = true;
          const pos = getPositionFromAnchor(room.playback);
          setLocalTime(pos);
          localTimeRef.current = pos;
          issueSeekCommand(pos);
        }

        if (room.mediaId && room.hlsUrl) {
          setMediaInfo(prev => {
            const isAsync = asyncPlayback.isAsyncModeRef.current;
            const isDifferentMedia = prev?.mediaFileId !== room.mediaId;

            // In async mode, preserve our own offset/URL unless the media itself changed.
            const effectiveOffset = (isAsync && !isDifferentMedia)
              ? (prev?.transcodeOffset ?? 0)
              : (room.transcodeOffset || 0);

            const effectiveHlsUrl = (isAsync && !isDifferentMedia)
              ? (prev?.hlsUrl ?? room.hlsUrl!)
              : room.hlsUrl!;

            const needsReinit = isDifferentMedia || prev?.transcodeOffset !== effectiveOffset;
            const nextKey = needsReinit ? (prev?.seekKey ?? 0) + 1 : (prev?.seekKey ?? 0);

            return {
              mediaFileId: room.mediaId!,
              title: room.mediaTitle || '',
              hlsUrl: effectiveHlsUrl,
              duration: room.duration,
              seekKey: nextKey,
              transcodeOffset: effectiveOffset,
              subtitles: room.subtitles || [],
            };
          });
        } else {
          setMediaInfo(null);
        }

      // ── playback.state ─────────────────────────────────────────────────
      } else if (msg.event === 'playback.state') {
        setRoomState(prev => {
          if (!prev) return prev;
          const playback = { ...msg.payload };
          if (!prev.mediaId) playback.state = 'waiting';
          return { ...prev, playback };
        });

        // Async users ignore room playback position changes & seeks.
        if (asyncPlayback.isAsyncModeRef.current) return;

        const pos = getPositionFromAnchor(msg.payload);
        setLocalTime(pos);
        localTimeRef.current = pos;

        // On buffering: seek everyone to the anchor so they're at the right spot.
        // On playing: no explicit seek needed, the video element will just play.
        if (msg.payload.state === 'buffering' || msg.payload.state === 'waiting') {
          issueSeekCommand(pos);
        }

      // ── media.changed ──────────────────────────────────────────────────
      } else if (msg.event === 'media.changed') {
        const isUserScoped = (msg.payload as any).sessionScope === 'user';
        const isAsync = asyncPlayback.isAsyncModeRef.current;

        if (msg.payload.mediaFileId && msg.payload.hlsUrl) {
          let isDifferentMedia = false;
          setMediaInfo(prev => {
            isDifferentMedia = prev?.mediaFileId !== msg.payload.mediaFileId;

            // Room changes different media while user is async → force exit async.
            if (isDifferentMedia && isAsync && !isUserScoped) {
              setTimeout(() => asyncPlayback.forceAsyncMode(false), 0);
            }

            // Async users ignore room-scoped media events (offset/url) unless media changed.
            const effectiveOffset = (isAsync && !isUserScoped && !isDifferentMedia)
              ? (prev?.transcodeOffset ?? 0)
              : (msg.payload.transcodeOffset || 0);

            const effectiveHlsUrl = (isAsync && !isUserScoped && !isDifferentMedia)
              ? (prev?.hlsUrl ?? msg.payload.hlsUrl)
              : msg.payload.hlsUrl;

            const needsReinit = isDifferentMedia || prev?.transcodeOffset !== effectiveOffset;
            const nextKey = needsReinit ? (prev?.seekKey ?? 0) + 1 : (prev?.seekKey ?? 0);

            return {
              mediaFileId: msg.payload.mediaFileId,
              title: msg.payload.title,
              hlsUrl: effectiveHlsUrl,
              duration: msg.payload.duration,
              seekKey: nextKey,
              transcodeOffset: effectiveOffset,
              subtitles: msg.payload.subtitles || [],
            };
          });
        } else {
          setMediaInfo(null);
          setRoomState(prev => {
            if (!prev) return prev;
            return {
              ...prev,
              mediaId: undefined,
              mediaTitle: undefined,
              hlsUrl: undefined,
              duration: undefined,
              transcodeOffset: undefined,
              subtitles: undefined,
              playback: { ...prev.playback, state: 'waiting' },
            };
          });
        }

      // ── user.status_changed ────────────────────────────────────────────
      } else if (msg.event === 'user.status_changed') {
        setRoomState(prev => {
          if (!prev) return prev;
          return {
            ...prev,
            members: prev.members.map(m =>
              m.userId === msg.payload.userId
                ? { ...m, status: msg.payload.status, pingQuality: msg.payload.pingQuality ?? m.pingQuality }
                : m
            ),
          };
        });

      // ── user.left ──────────────────────────────────────────────────────
      } else if (msg.event === 'user.left') {
        setRoomState(prev => {
          if (!prev) return prev;
          return { ...prev, members: prev.members.filter(m => m.userId !== msg.payload.userId) };
        });

      // ── party.updated ──────────────────────────────────────────────────
      } else if (msg.event === 'party.updated') {
        setRoomState(prev => {
          if (!prev) return prev;
          return {
            ...prev,
            members: prev.members.map(m =>
              m.userId === msg.payload.userId ? { ...m, party: msg.payload.party } : m
            ),
          };
        });

      // ── sync.heartbeat_ack (ping quality) ─────────────────────────────
      } else if (msg.event === 'sync.heartbeat_ack') {
        const rawPing = Date.now() - msg.payload.timestamp;
        const cur = smoothedPingRef.current;
        smoothedPingRef.current = cur === undefined ? rawPing : cur * 0.7 + rawPing * 0.3;

        let newTier = 0;
        if (smoothedPingRef.current >= 300) newTier = 2;
        else if (smoothedPingRef.current >= 150) newTier = 1;

        if (consecutivePingRef.current.tier !== newTier) {
          consecutivePingRef.current = { tier: newTier, count: 1 };
        } else {
          consecutivePingRef.current.count += 1;
        }

        if (consecutivePingRef.current.count >= 3 && pingQualityRef.current !== newTier) {
          pingQualityRef.current = newTier;
        }

      // ── sync.correct (drift correction) ───────────────────────────────
      } else if (msg.event === 'sync.correct') {
        if (asyncPlayback.isAsyncModeRef.current) return;

        if (msg.payload.seek) {
          console.warn(`[sync] Hard seek correction: ${localTimeRef.current.toFixed(2)}s → ${msg.payload.position.toFixed(2)}s`);
          setLocalTime(msg.payload.position);
          localTimeRef.current = msg.payload.position;
          issueSeekCommand(msg.payload.position);
        }

        if (msg.payload.playbackRate !== undefined) {
          if (msg.payload.playbackRate === 1.0) {
            setLocalCorrectionRate(null);
            if (correctionTimeoutRef.current) clearTimeout(correctionTimeoutRef.current);
          } else {
            console.warn(`[sync] Soft rate correction: ${msg.payload.playbackRate}x for ${msg.payload.correctionDurationMs}ms`);
            setLocalCorrectionRate(msg.payload.playbackRate);
            if (correctionTimeoutRef.current) clearTimeout(correctionTimeoutRef.current);
            if (msg.payload.correctionDurationMs) {
              correctionTimeoutRef.current = setTimeout(() => {
                setLocalCorrectionRate(null);
              }, msg.payload.correctionDurationMs);
            }
          }
        }
      }
    });

    return () => remove();
  }, [addMessageHandler, getPositionFromAnchor, issueSeekCommand, asyncPlayback.isAsyncModeRef, asyncPlayback.forceAsyncMode]);

  // ── Heartbeat ──────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!isConnected) return;
    const interval = setInterval(() => {
      if (asyncPlayback.isAsyncModeRef.current) return; // Async heartbeat handled by useAsyncPlayback.
      sendMessage({
        event: 'sync.heartbeat',
        payload: {
          position: localTimeRef.current,
          playing: playbackStateRef.current === 'playing',
          playbackRate: activeRateRef.current,
          resolution: activeResolutionRef.current as any,
          timestamp: Date.now(),
          pingQuality: pingQualityRef.current,
          status: localStatusRef.current,
        },
      });
    }, 5000);
    return () => clearInterval(interval);
  }, [isConnected, sendMessage, asyncPlayback.isAsyncModeRef]);

  useEffect(() => {
    if (!isConnected) {
      hasInitializedRef.current = false;
    }
  }, [isConnected]);

  // ── Public Actions ─────────────────────────────────────────────────────────

  const play = useCallback(() => {
    if (asyncPlayback.isAsyncModeRef.current) return asyncPlayback.play();
    sendMessage({ event: 'playback.play', payload: {} });
  }, [sendMessage, asyncPlayback]);

  const pause = useCallback(() => {
    if (asyncPlayback.isAsyncModeRef.current) return asyncPlayback.pause();
    sendMessage({ event: 'playback.pause', payload: {} });
  }, [sendMessage, asyncPlayback]);

  const seek = useCallback((position: number, forceNewOffset: boolean = false) => {
    setLocalTime(position);
    localTimeRef.current = position;

    if (asyncPlayback.isAsyncModeRef.current) {
      // Async seek: update local video immediately and let server handle the HLS offset.
      asyncPlayback.seek(position, forceNewOffset);
      issueSeekCommand(position);
      return;
    }

    // Sync seek: Server will broadcast buffering to all, which will pause playback
    // globally until everyone is ready. We DO NOT optimistically update roomState here
    // because if the server debounces this request, we will be stuck in a stale buffering state.
    issueSeekCommand(position);
    sendMessage({ event: 'playback.seek', payload: { position, forceNewOffset } });
  }, [sendMessage, asyncPlayback, issueSeekCommand]);

  const setStatus = useCallback((status: SyncStatus) => {
    localStatusRef.current = status;
    if (asyncPlayback.isAsyncModeRef.current) return asyncPlayback.setStatus(status as any);
    sendMessage({ event: 'sync.status', payload: { status: status as 'ready' | 'buffering' | 'async' } });
  }, [sendMessage, asyncPlayback]);

  const setRate = useCallback((rate: number) => {
    if (asyncPlayback.isAsyncModeRef.current) return asyncPlayback.setRate(rate);
    sendMessage({ event: 'playback.set_rate', payload: { rate } });
  }, [sendMessage, asyncPlayback]);

  const reportLocalTime = useCallback((time: number) => {
    localTimeRef.current = time;
    setLocalTime(time);
  }, []);

  const reportActiveResolution = useCallback((resolution: string) => {
    if (activeResolutionRef.current !== resolution) {
      activeResolutionRef.current = resolution;
      if (isConnected) {
        sendMessage({
          event: 'sync.heartbeat',
          payload: {
            position: localTimeRef.current,
            playing: playbackStateRef.current === 'playing',
            playbackRate: activeRateRef.current,
            resolution: resolution as any,
            timestamp: Date.now(),
            pingQuality: pingQualityRef.current,
            status: asyncPlayback.isAsyncModeRef.current ? 'async' : localStatusRef.current,
          },
        });
      }
    }
  }, [isConnected, sendMessage, asyncPlayback.isAsyncModeRef]);

  const updatePartyState = useCallback((updates: { isJoined?: boolean; micMuted?: boolean; videoMuted?: boolean }) => {
    sendMessage({ event: 'party.update', payload: updates });
  }, [sendMessage]);

  const setControlLock = useCallback((userId: string, locked: boolean) => {
    sendMessage({ event: 'room.set_control_lock', payload: { userId, locked } });
  }, [sendMessage]);

  const updateSettings = useCallback((settings: { allowAsyncMode?: boolean }) => {
    sendMessage({ event: 'room.update_settings', payload: { settings } });
  }, [sendMessage]);

  // When in async mode, overlay the local async playback state over the room state.
  const effectiveRoomState = asyncPlayback.isAsyncMode && asyncPlayback.asyncPlaybackState && roomState
    ? { ...roomState, playback: asyncPlayback.asyncPlaybackState }
    : roomState;

  return {
    isConnected,
    roomState: effectiveRoomState,
    mediaInfo,
    seekKey: mediaInfo?.seekKey ?? 0,
    localTime,
    localCorrectionRate,
    seekCommand,
    play,
    pause,
    seek,
    setRate,
    setStatus,
    sendMessage,
    addMessageHandler,
    reportLocalTime,
    reportActiveResolution,
    isAsyncMode: asyncPlayback.isAsyncMode,
    toggleAsyncMode: asyncPlayback.toggleAsyncMode,
    forceAsyncMode: asyncPlayback.forceAsyncMode,
    updatePartyState,
    setControlLock,
    updateSettings,
  };
}
