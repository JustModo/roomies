import { useState, useEffect, useRef, useCallback } from 'react';
import { useWebSocket } from './useWebSocket';
import { OutgoingSocketMessage } from '@roomies/contracts';

export type RoomState = Extract<OutgoingSocketMessage, { event: 'room.state' }>['payload']['room'];

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

  const [localTime, setLocalTime] = useState(0);
  const [localCorrectionRate, setLocalCorrectionRate] = useState<number | null>(null);
  const localTimeRef = useRef(0);
  const correctionTimeoutRef = useRef<ReturnType<typeof setTimeout>>();

  // NOTE: Explicit seek triggers to prevent seek feedback loops.
  const [syncSeekTrigger, setSyncSeekTrigger] = useState(0);
  const [syncSeekPosition, setSyncSeekPosition] = useState(0);

  const getInitialPosition = useCallback((playback: RoomState['playback']) => {
    let pos = playback.anchorPosition;
    if (playback.state === 'playing') {
      const elapsed = (Date.now() - playback.anchorTime) / 1000;
      pos += elapsed * playback.playbackRate;
    }
    return pos;
  }, []);

  useEffect(() => {
    const remove = addMessageHandler((msg) => {
      if (msg.event === 'room.state') {
        setRoomState(msg.payload.room);
        const initialPos = getInitialPosition(msg.payload.room.playback);
        setLocalTime(initialPos);
        localTimeRef.current = initialPos;

        setSyncSeekPosition(initialPos);
        setSyncSeekTrigger((prev) => prev + 1);

        if (msg.payload.room.mediaId && msg.payload.room.hlsUrl) {
          setMediaInfo((prev) => {
            const isDifferentMedia = prev?.mediaFileId !== msg.payload.room.mediaId;
            const isDifferentOffset = prev?.transcodeOffset !== msg.payload.room.transcodeOffset;
            const nextKey = (isDifferentMedia || isDifferentOffset) ? (prev?.seekKey ?? 0) + 1 : prev?.seekKey ?? 0;
            return {
              mediaFileId: msg.payload.room.mediaId!,
              title: msg.payload.room.mediaTitle || '',
              hlsUrl: msg.payload.room.hlsUrl!,
              duration: msg.payload.room.duration,
              seekKey: nextKey,
              transcodeOffset: msg.payload.room.transcodeOffset || 0,
              subtitles: msg.payload.room.subtitles || [],
            };
          });
        } else {
          setMediaInfo(null);
        }
      } else if (msg.event === 'playback.state') {
        setRoomState((prev) => {
          if (!prev) return prev;
          return { ...prev, playback: msg.payload };
        });
        const initialPos = getInitialPosition(msg.payload);
        setLocalTime(initialPos);
        localTimeRef.current = initialPos;

        if (msg.payload.state === 'buffering') {
          setSyncSeekPosition(initialPos);
          setSyncSeekTrigger((prev) => prev + 1);
        }
      } else if (msg.event === 'media.changed') {
        if (msg.payload.mediaFileId && msg.payload.hlsUrl) {
          setMediaInfo((prev) => {
              const isDifferentMedia = prev?.mediaFileId !== msg.payload.mediaFileId;
              const isDifferentOffset = prev?.transcodeOffset !== msg.payload.transcodeOffset;
              const nextKey = (isDifferentMedia || isDifferentOffset) ? (prev?.seekKey ?? 0) + 1 : prev?.seekKey ?? 0;
              return {
                mediaFileId: msg.payload.mediaFileId,
                title: msg.payload.title,
                hlsUrl: msg.payload.hlsUrl,
                duration: msg.payload.duration,
                seekKey: nextKey,
                transcodeOffset: msg.payload.transcodeOffset || 0,
                subtitles: msg.payload.subtitles || [],
              };
          });
        } else {
          setMediaInfo(null);
        }
      } else if (msg.event === 'user.status_changed') {
        setRoomState((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            members: prev.members.map(m => 
              m.userId === msg.payload.userId ? { ...m, status: msg.payload.status } : m
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
      } else if (msg.event === 'sync.correct') {
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
  }, [addMessageHandler, getInitialPosition]);

  useEffect(() => {
    let lastTick = Date.now();
    const interval = setInterval(() => {
      const now = Date.now();
      const delta = (now - lastTick) / 1000;
      lastTick = now;

      if (roomState?.playback.state === 'playing') {
        setLocalTime(prev => {
          const rate = localCorrectionRate ?? roomState.playback.playbackRate;
          const next = prev + delta * rate;
          localTimeRef.current = next;
          return next;
        });
      }
    }, 100);
    return () => clearInterval(interval);
  }, [roomState?.playback.state, roomState?.playback.playbackRate, localCorrectionRate]);

  const playbackStateRef = useRef(roomState?.playback.state);
  const playbackRateRef = useRef(roomState?.playback.playbackRate);
  const activeRateRef = useRef(1);

  useEffect(() => {
    playbackStateRef.current = roomState?.playback.state;
    playbackRateRef.current = roomState?.playback.playbackRate;
    activeRateRef.current = localCorrectionRate ?? roomState?.playback.playbackRate ?? 1;
  }, [roomState?.playback.state, roomState?.playback.playbackRate, localCorrectionRate]);

  useEffect(() => {
    if (!isConnected) return;
    const interval = setInterval(() => {
      sendMessage({
        event: 'sync.heartbeat',
        payload: { 
          position: localTimeRef.current,
          playing: playbackStateRef.current === 'playing',
          playbackRate: activeRateRef.current
        }
      });
    }, 5000);
    return () => clearInterval(interval);
  }, [isConnected, sendMessage]);

  const play = useCallback(() => {
    sendMessage({ event: 'playback.play', payload: {} });
  }, [sendMessage]);

  const pause = useCallback(() => {
    sendMessage({ event: 'playback.pause', payload: {} });
  }, [sendMessage]);

  const seek = useCallback((position: number) => {
    sendMessage({ event: 'playback.seek', payload: { position } });
    setLocalTime(position);
    localTimeRef.current = position;
  }, [sendMessage]);

  const setStatus = useCallback((status: 'ready' | 'buffering') => {
    sendMessage({ event: 'sync.status', payload: { status } });
  }, [sendMessage]);

  const setRate = useCallback((rate: number) => {
    sendMessage({ event: 'playback.set_rate', payload: { rate } });
  }, [sendMessage]);

  return {
    isConnected,
    roomState,
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
    addMessageHandler
  };
}
