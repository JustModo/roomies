import { useState, useCallback, useEffect, useRef, MutableRefObject } from 'react';
import { RoomState } from './useRoomSync';

interface UseAsyncPlaybackParams {
  isConnected: boolean;
  sendMessage: (msg: any) => void;
  localTimeRef: MutableRefObject<number>;
  roomPlaybackState?: RoomState['playback'];
}

export function useAsyncPlayback({
  isConnected,
  sendMessage,
  localTimeRef,
  roomPlaybackState,
}: UseAsyncPlaybackParams) {
  const [isAsyncMode, setIsAsyncMode] = useState(false);
  const isAsyncModeRef = useRef(false);
  
  const [asyncPlaybackState, setAsyncPlaybackState] = useState<RoomState['playback'] | null>(null);
  const [asyncSeekKey, setAsyncSeekKey] = useState(0);

  // Send periodic heartbeat for the async transcoder
  useEffect(() => {
    if (!isConnected || !isAsyncModeRef.current) return;
    
    const interval = setInterval(() => {
      sendMessage({
        event: 'sync.heartbeat',
        payload: {
          position: localTimeRef.current,
          playing: asyncPlaybackState?.state === 'playing',
          playbackRate: asyncPlaybackState?.playbackRate || 1
        }
      });
    }, 5000);
    return () => clearInterval(interval);
  }, [isConnected, sendMessage, asyncPlaybackState]);

  const toggleAsyncMode = useCallback(() => {
    setIsAsyncMode(prev => {
      const next = !prev;
      isAsyncModeRef.current = next;
      
      if (next) {
        sendMessage({ event: 'sync.status', payload: { status: 'async' as any } });
        setAsyncPlaybackState(roomPlaybackState ? {
          ...roomPlaybackState,
          anchorPosition: localTimeRef.current,
          anchorTime: Date.now(),
        } : null);
      } else {
        setAsyncPlaybackState(null);
      }
      return next;
    });
  }, [sendMessage, roomPlaybackState, localTimeRef]);

  const play = useCallback(() => {
    setAsyncPlaybackState(prev => prev ? { ...prev, state: 'playing', intendedState: 'playing', anchorPosition: localTimeRef.current, anchorTime: Date.now() } : prev);
  }, [localTimeRef]);

  const pause = useCallback(() => {
    setAsyncPlaybackState(prev => prev ? { ...prev, state: 'paused', intendedState: 'paused', anchorPosition: localTimeRef.current, anchorTime: Date.now() } : prev);
  }, [localTimeRef]);

  const seek = useCallback((position: number, isBuffered: boolean = false) => {
    setAsyncPlaybackState(prev => prev ? { ...prev, state: 'buffering', anchorPosition: position, anchorTime: Date.now() } : prev);

    if (!isBuffered) {
      // Position is outside the current HLS buffer — tear down and restart from new offset.
      setAsyncSeekKey(prev => prev + 1);
    }
    
    // Immediate heartbeat for seek to help transcoder start ASAP
    sendMessage({
      event: 'sync.heartbeat',
      payload: {
        position,
        playing: false,
        playbackRate: asyncPlaybackState?.playbackRate || 1
      }
    });
  }, [sendMessage, asyncPlaybackState]);

  const setStatus = useCallback((status: 'ready' | 'buffering') => {
    setAsyncPlaybackState(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        state: status === 'buffering' ? 'buffering' : prev.intendedState,
        anchorPosition: localTimeRef.current,
        anchorTime: Date.now()
      };
    });
  }, [localTimeRef]);

  const setRate = useCallback((rate: number) => {
    setAsyncPlaybackState(prev => prev ? { ...prev, playbackRate: rate, anchorPosition: localTimeRef.current, anchorTime: Date.now() } : prev);
  }, [localTimeRef]);

  return {
    isAsyncMode,
    isAsyncModeRef,
    asyncPlaybackState,
    asyncSeekKey,
    toggleAsyncMode,
    play,
    pause,
    seek,
    setStatus,
    setRate
  };
}
