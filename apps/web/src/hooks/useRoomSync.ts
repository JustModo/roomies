import { useState, useEffect, useRef, useCallback } from 'react';
import { useWebSocket } from './useWebSocket';
import { OutgoingSocketMessage } from '@roomies/contracts';
import { useAsyncPlayback } from './useAsyncPlayback';

export type RoomState = Extract<OutgoingSocketMessage, { event: 'room.state' }>['payload']['room'];
export type MemberState = RoomState['members'][0];
export type SyncStatus = MemberState['status'];

export interface SubtitleTrack {
  id: string;
  language: string | null;
}

export interface MediaInfo {
  mediaFileId: string;
  title: string;
  hlsUrl: string;
  duration?: number;
  seekKey?: number;
  transcodeOffset: number;
  subtitles: SubtitleTrack[];
}

export function useRoomSync() {
  const { isConnected, sendMessage, addMessageHandler } = useWebSocket();
  const [roomState, setRoomState] = useState<RoomState | null>(null);
  const [mediaInfo, setMediaInfo] = useState<MediaInfo | null>(null);
  const hasInitializedRef = useRef(false);
  
  const [localTime, setLocalTime] = useState(0);
  const [localCorrectionRate, setLocalCorrectionRate] = useState<number | null>(null);
  const localTimeRef = useRef(0);
  const correctionTimeoutRef = useRef<ReturnType<typeof setTimeout>>();

  // NOTE: Explicit seek triggers to prevent seek feedback loops.
  const [syncSeekTrigger, setSyncSeekTrigger] = useState(0);
  const [syncSeekPosition, setSyncSeekPosition] = useState(0);
  const smoothedPingRef = useRef<number>();
  const pingQualityRef = useRef<number>(0);
  const consecutivePingRef = useRef<{ tier: number, count: number }>({ tier: 0, count: 0 });
  const activeResolutionRef = useRef<string | undefined>();
  const localStatusRef = useRef<SyncStatus>('ready');

  const asyncPlayback = useAsyncPlayback({
    isConnected,
    sendMessage,
    localTimeRef,
    activeResolutionRef,
    roomPlaybackState: roomState?.playback
  });

  const getInitialPosition = useCallback((playback: RoomState['playback']) => {
    let pos = playback.anchorPosition;
    if (playback.state === 'playing') {
      const elapsed = (Date.now() - playback.anchorTime) / 1000;
      pos += elapsed * playback.playbackRate;
    }
    return pos;
  }, []);

  const prevIsAsyncMode = useRef(asyncPlayback.isAsyncMode);
  useEffect(() => {
    if (prevIsAsyncMode.current && !asyncPlayback.isAsyncMode && roomState) {
      // Async turned off!
      const initialPos = getInitialPosition(roomState.playback);
      setLocalTime(initialPos);
      localTimeRef.current = initialPos;
      setSyncSeekPosition(initialPos);
      setSyncSeekTrigger(t => t + 1);
    }
    prevIsAsyncMode.current = asyncPlayback.isAsyncMode;
  }, [asyncPlayback.isAsyncMode, roomState, getInitialPosition]);

  useEffect(() => {
    const remove = addMessageHandler((msg) => {
      if (msg.event === 'room.state') {
        const room = msg.payload.room;
        if (!room.mediaId) {
          room.playback.state = 'waiting';
        }
        setRoomState(room);
        if (!hasInitializedRef.current && !asyncPlayback.isAsyncModeRef.current) {
          hasInitializedRef.current = true;
          const initialPos = getInitialPosition(msg.payload.room.playback);
          setLocalTime(initialPos);
          localTimeRef.current = initialPos;
          setSyncSeekPosition(initialPos);
          setSyncSeekTrigger((prev) => prev + 1);
        }

        if (msg.payload.room.mediaId && msg.payload.room.hlsUrl) {
          setMediaInfo((prev) => {
            const isAsync = asyncPlayback.isAsyncModeRef.current;
            const isDifferentMedia = prev?.mediaFileId !== msg.payload.room.mediaId;
            
            // In async mode, preserve our offset and URL if the video hasn't changed.
            // room.state always broadcasts the sync offset and sync URL.
            const effectiveOffset = (isAsync && !isDifferentMedia)
              ? (prev?.transcodeOffset ?? 0)
              : (msg.payload.room.transcodeOffset || 0);
              
            const effectiveHlsUrl = (isAsync && !isDifferentMedia)
              ? (prev?.hlsUrl ?? msg.payload.room.hlsUrl!)
              : msg.payload.room.hlsUrl!;

            const isDifferentOffset = prev?.transcodeOffset !== effectiveOffset;
            const nextKey = (isDifferentMedia || isDifferentOffset) ? (prev?.seekKey ?? 0) + 1 : prev?.seekKey ?? 0;
            return {
              mediaFileId: msg.payload.room.mediaId!,
              title: msg.payload.room.mediaTitle || '',
              hlsUrl: effectiveHlsUrl,
              duration: msg.payload.room.duration,
              seekKey: nextKey,
              transcodeOffset: effectiveOffset,
              subtitles: msg.payload.room.subtitles || [],
            };
          });
        } else {
          setMediaInfo(null);
        }
      } else if (msg.event === 'playback.state') {
        setRoomState((prev) => {
          if (!prev) return prev;
          const playback = { ...msg.payload };
          if (!prev.mediaId) {
            playback.state = 'waiting';
          }
          return { ...prev, playback };
        });
        if (!asyncPlayback.isAsyncModeRef.current) {
          const initialPos = getInitialPosition(msg.payload);
          setLocalTime(initialPos);
          localTimeRef.current = initialPos;

          if (msg.payload.state === 'buffering' || msg.payload.state === 'waiting') {
            setSyncSeekPosition(initialPos);
            setSyncSeekTrigger((prev) => prev + 1);
          }
        }
      } else if (msg.event === 'media.changed') {
        const isUserScoped = (msg.payload as any).sessionScope === 'user';
        const isAsync = asyncPlayback.isAsyncModeRef.current;

        if (msg.payload.mediaFileId && msg.payload.hlsUrl) {
          let isDifferentMedia = false;
          setMediaInfo((prev) => {
            isDifferentMedia = prev?.mediaFileId !== msg.payload.mediaFileId;

            if (isDifferentMedia && isAsync && !isUserScoped) {
              setTimeout(() => asyncPlayback.forceAsyncMode(false), 0);
            }

            // In async mode, only user-scoped events update the offset/url (unless media changed).
            // Room-scoped events preserve the async user's current offset and url.
            const effectiveOffset = (isAsync && !isUserScoped && !isDifferentMedia)
              ? (prev?.transcodeOffset ?? 0)
              : (msg.payload.transcodeOffset || 0);
              
            const effectiveHlsUrl = (isAsync && !isUserScoped && !isDifferentMedia)
              ? (prev?.hlsUrl ?? msg.payload.hlsUrl)
              : msg.payload.hlsUrl;

            const isDifferentOffset = prev?.transcodeOffset !== effectiveOffset;
            const nextKey = (isDifferentMedia || isDifferentOffset) ? (prev?.seekKey ?? 0) + 1 : prev?.seekKey ?? 0;
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
          setRoomState((prev) => {
            if (!prev) return prev;
            return {
              ...prev,
              mediaId: undefined,
              mediaTitle: undefined,
              hlsUrl: undefined,
              duration: undefined,
              transcodeOffset: undefined,
              subtitles: undefined,
              playback: {
                ...prev.playback,
                state: 'waiting'
              }
            };
          });
        }
      } else if (msg.event === 'user.status_changed') {
        setRoomState((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            members: prev.members.map(m => 
              m.userId === msg.payload.userId ? { ...m, status: msg.payload.status, pingQuality: msg.payload.pingQuality ?? m.pingQuality } : m
            )
          };
        });
      } else if (msg.event === 'user.left') {
        setRoomState((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            members: prev.members.filter(m => m.userId !== msg.payload.userId)
          };
        });
      } else if (msg.event === 'party.updated') {
        setRoomState((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            members: prev.members.map(m => 
              m.userId === msg.payload.userId ? { ...m, party: msg.payload.party } : m
            )
          };
        });
      } else if (msg.event === 'sync.heartbeat_ack') {
        const rawPing = Date.now() - msg.payload.timestamp;
        const currentSmoothed = smoothedPingRef.current;
        smoothedPingRef.current = currentSmoothed === undefined ? rawPing : (currentSmoothed * 0.7 + rawPing * 0.3);
        
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
      } else if (msg.event === 'sync.correct') {
        if (asyncPlayback.isAsyncModeRef.current) return;
        if (msg.payload.seek) {
          console.warn(`[sync] Hard seek correction from ${localTimeRef.current.toFixed(2)} to ${msg.payload.position.toFixed(2)}`);
          setLocalTime(msg.payload.position);
          localTimeRef.current = msg.payload.position;
          setSyncSeekPosition(msg.payload.position);
          setSyncSeekTrigger((prev) => prev + 1);
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
                console.warn(`[sync] Soft rate correction expired, reverting to normal`);
                setLocalCorrectionRate(null);
              }, msg.payload.correctionDurationMs);
            }
          }
        }
      }
    });

    return () => remove();
  }, [addMessageHandler, getInitialPosition, asyncPlayback.isAsyncModeRef]);

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
            status: asyncPlayback.isAsyncModeRef.current ? 'async' : localStatusRef.current
          }
        });
      }
    }
  }, [isConnected, sendMessage, asyncPlayback.isAsyncModeRef]);

  const playbackStateRef = useRef(roomState?.playback.state);
  const playbackRateRef = useRef(roomState?.playback.playbackRate);
  const activeRateRef = useRef(1);

  // Clear soft correction when room playrate changes
  const prevPlaybackRateRef = useRef(roomState?.playback.playbackRate);
  useEffect(() => {
    if (roomState?.playback.playbackRate !== prevPlaybackRateRef.current) {
      setLocalCorrectionRate(null);
      if (correctionTimeoutRef.current) clearTimeout(correctionTimeoutRef.current);
    }
    prevPlaybackRateRef.current = roomState?.playback.playbackRate;
  }, [roomState?.playback.playbackRate]);

  // Clear soft correction when entering async mode
  useEffect(() => {
    if (asyncPlayback.isAsyncModeRef.current) {
      setLocalCorrectionRate(null);
      if (correctionTimeoutRef.current) clearTimeout(correctionTimeoutRef.current);
    }
  }, [asyncPlayback.isAsyncModeRef.current]);

  useEffect(() => {
    playbackStateRef.current = roomState?.playback.state;
    playbackRateRef.current = roomState?.playback.playbackRate;
    activeRateRef.current = localCorrectionRate ?? roomState?.playback.playbackRate ?? 1;
  }, [roomState?.playback.state, roomState?.playback.playbackRate, localCorrectionRate]);

  useEffect(() => {
    if (!isConnected) return;
    const interval = setInterval(() => {
      if (asyncPlayback.isAsyncModeRef.current) return;
      sendMessage({
        event: 'sync.heartbeat',
        payload: { 
          position: localTimeRef.current,
          playing: playbackStateRef.current === 'playing',
          playbackRate: activeRateRef.current,
          resolution: activeResolutionRef.current as any,
          timestamp: Date.now(),
          pingQuality: pingQualityRef.current,
          status: localStatusRef.current
        }
      });
    }, 5000);
    return () => clearInterval(interval);
  }, [isConnected, sendMessage, asyncPlayback.isAsyncModeRef]);

  useEffect(() => {
    if (!isConnected) {
      hasInitializedRef.current = false;
    }
  }, [isConnected]);

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
      asyncPlayback.seek(position, forceNewOffset);
      // Trigger local video seek for instant feedback.
      setSyncSeekPosition(position);
      setSyncSeekTrigger(t => t + 1);
      return;
    }
    
    // Optimistically update local state to prevent rubber-banding
    setRoomState((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        playback: {
          ...prev.playback,
          state: 'buffering',
          anchorPosition: position,
          anchorTime: Date.now()
        }
      };
    });
    setSyncSeekPosition(position);
    setSyncSeekTrigger(t => t + 1);

    sendMessage({ event: 'playback.seek', payload: { position, forceNewOffset } });
  }, [sendMessage, asyncPlayback]);

  const setStatus = useCallback((status: SyncStatus) => {
    localStatusRef.current = status;
    if (asyncPlayback.isAsyncModeRef.current) return asyncPlayback.setStatus(status as any);
    sendMessage({ event: 'sync.status', payload: { status: status as 'ready' | 'buffering' | 'async' } });
  }, [sendMessage, asyncPlayback]);

  const setRate = useCallback((rate: number) => {
    if (asyncPlayback.isAsyncModeRef.current) return asyncPlayback.setRate(rate);
    sendMessage({ event: 'playback.set_rate', payload: { rate } });
  }, [sendMessage, asyncPlayback]);

  const updatePartyState = useCallback((updates: { isJoined?: boolean, micMuted?: boolean, videoMuted?: boolean }) => {
    sendMessage({ event: 'party.update', payload: updates });
  }, [sendMessage]);

  const setControlLock = useCallback((userId: string, locked: boolean) => {
    sendMessage({ event: 'room.set_control_lock', payload: { userId, locked } });
  }, [sendMessage]);

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
    syncSeekTrigger,
    syncSeekPosition,
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
    setControlLock
  };
}
