import { useState, useEffect, useRef, useCallback } from 'react';
import { useWebSocket } from './useWebSocket';
import { OutgoingSocketMessage } from '@roomies/contracts';

export type RoomState = Extract<OutgoingSocketMessage, { event: 'room.state' }>['payload']['room'];

export interface MediaInfo {
  mediaFileId: string;
  title: string;
  hlsUrl: string;
}

export function useRoomSync() {
  const { isConnected, sendMessage, addMessageHandler } = useWebSocket();
  const [roomState, setRoomState] = useState<RoomState | null>(null);
  const [mediaInfo, setMediaInfo] = useState<MediaInfo | null>(null);

  // We maintain a local "simulated" position for the player
  const [localTime, setLocalTime] = useState(0);
  const localTimeRef = useRef(0);

  // Sync state incoming from server
  useEffect(() => {
    const remove = addMessageHandler((msg) => {
      if (msg.event === 'room.state') {
        setRoomState(msg.payload.room);
        setLocalTime(msg.payload.room.playback.anchorPosition);
        localTimeRef.current = msg.payload.room.playback.anchorPosition;

        // Sync media info from room state
        if (msg.payload.room.mediaId && msg.payload.room.hlsUrl) {
          setMediaInfo({
            mediaFileId: msg.payload.room.mediaId,
            title: msg.payload.room.mediaTitle || '',
            hlsUrl: msg.payload.room.hlsUrl,
          });
        }
      } else if (msg.event === 'playback.state') {
        setRoomState((prev) => {
          if (!prev) return prev;
          return { ...prev, playback: msg.payload };
        });
        setLocalTime(msg.payload.anchorPosition);
        localTimeRef.current = msg.payload.anchorPosition;
      } else if (msg.event === 'media.changed') {
        // Server has changed the media — update media info
        setMediaInfo({
          mediaFileId: msg.payload.mediaFileId,
          title: msg.payload.title,
          hlsUrl: msg.payload.hlsUrl,
        });
      } else if (msg.event === 'user.ready_changed') {
        setRoomState((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            members: prev.members.map(m => 
              m.userId === msg.payload.userId ? { ...m, ready: msg.payload.ready } : m
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
        console.warn(`[SYNC] Forcing local time from ${localTimeRef.current.toFixed(2)} to ${msg.payload.position.toFixed(2)}`);
        setLocalTime(msg.payload.position);
        localTimeRef.current = msg.payload.position;
      } else if (msg.event === 'sync.wait') {
        setRoomState((prev) => {
          if (!prev) return prev;
          return { ...prev, playback: { ...prev.playback, state: 'buffering' } };
        });
      } else if (msg.event === 'sync.resume') {
        setRoomState((prev) => {
          if (!prev) return prev;
          return { ...prev, playback: { ...prev.playback, state: 'playing', anchorTime: Date.now() } };
        });
      }
    });

    return () => remove();
  }, [addMessageHandler]);

  // Player simulation loop
  useEffect(() => {
    const interval = setInterval(() => {
      if (roomState?.playback.state === 'playing') {
        setLocalTime(prev => {
          const next = prev + 0.1 * roomState.playback.playbackRate;
          localTimeRef.current = next;
          return next;
        });
      }
    }, 100);
    return () => clearInterval(interval);
  }, [roomState?.playback.state, roomState?.playback.playbackRate]);

  // Heartbeat loop
  useEffect(() => {
    if (!isConnected) return;
    const interval = setInterval(() => {
      sendMessage({
        event: 'sync.heartbeat',
        payload: { 
          position: localTimeRef.current,
          playing: roomState?.playback.state === 'playing',
          playbackRate: roomState?.playback.playbackRate ?? 1
        }
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [isConnected, sendMessage, roomState?.playback.state, roomState?.playback.playbackRate]);

  // Actions
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

  const ready = useCallback(() => {
    sendMessage({ event: 'room.ready', payload: {} });
  }, [sendMessage]);

  const notReady = useCallback(() => {
    sendMessage({ event: 'room.not_ready', payload: {} });
  }, [sendMessage]);

  const buffering = useCallback(() => {
    sendMessage({ event: 'sync.buffering', payload: {} });
  }, [sendMessage]);

  const buffered = useCallback(() => {
    sendMessage({ event: 'sync.buffered', payload: {} });
  }, [sendMessage]);

  return {
    isConnected,
    roomState,
    mediaInfo,
    localTime,
    play,
    pause,
    seek,
    ready,
    notReady,
    buffering,
    buffered,
    sendMessage,
    addMessageHandler
  };
}
