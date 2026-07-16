import { useState, useCallback, useEffect, useRef, MutableRefObject } from 'react';
import { RoomState } from './useRoomSync';

interface UseAsyncPlaybackParams {
  isConnected: boolean;
  sendMessage: (msg: any) => void;
  localTimeRef: MutableRefObject<number>;
  activeResolutionRef: MutableRefObject<string | undefined>;
  roomPlaybackState?: RoomState['playback'];
}

export function useAsyncPlayback({
  isConnected,
  sendMessage,
  localTimeRef,
  activeResolutionRef,
  roomPlaybackState,
}: UseAsyncPlaybackParams) {
  const [isAsyncMode, setIsAsyncMode] = useState(false);
  const isAsyncModeRef = useRef(false);
  
  const [asyncPlaybackState, setAsyncPlaybackState] = useState<RoomState['playback'] | null>(null);

  // Send periodic heartbeat for the async transcoder
  useEffect(() => {
    if (!isConnected || !isAsyncModeRef.current) return;
    
    const interval = setInterval(() => {
      sendMessage({
        event: 'sync.heartbeat',
        payload: {
          position: localTimeRef.current,
          playing: asyncPlaybackState?.state === 'playing',
          playbackRate: asyncPlaybackState?.playbackRate || 1,
          resolution: activeResolutionRef.current as any
        }
      });
    }, 5000);
    return () => clearInterval(interval);
  }, [isConnected, sendMessage, asyncPlaybackState]);

  const forceAsyncMode = useCallback((enabled: boolean) => {
    setIsAsyncMode(prev => {
      if (prev === enabled) return prev;
      isAsyncModeRef.current = enabled;
      
      if (enabled) {
        sendMessage({ event: 'sync.status', payload: { status: 'async' as any } });
        setAsyncPlaybackState(roomPlaybackState ? {
          ...roomPlaybackState,
          anchorPosition: localTimeRef.current,
          anchorTime: Date.now(),
        } : null);
      } else {
        sendMessage({ event: 'sync.status', payload: { status: 'watching' as any } });
        setAsyncPlaybackState(null);
      }
      return enabled;
    });
  }, [sendMessage, roomPlaybackState, localTimeRef]);

  const toggleAsyncMode = useCallback(() => {
    forceAsyncMode(!isAsyncModeRef.current);
  }, [forceAsyncMode]);

  const play = useCallback(() => {
    setAsyncPlaybackState(prev => prev ? { ...prev, state: 'playing', intendedState: 'playing', anchorPosition: localTimeRef.current, anchorTime: Date.now() } : prev);
  }, [localTimeRef]);

  const pause = useCallback(() => {
    setAsyncPlaybackState(prev => prev ? { ...prev, state: 'paused', intendedState: 'paused', anchorPosition: localTimeRef.current, anchorTime: Date.now() } : prev);
  }, [localTimeRef]);

  /**
   * Seek in async mode — sends the request to the server, which uses the
   * same coordinator as sync to decide whether a transcode reinit is needed.
   *
   * The server responds with a user-scoped `media.changed` event containing
   * the resolved transcodeOffset. The HLS player reinits only when the
   * offset actually changes (via seekKey in useRoomSync).
   *
   * Play/pause state is set locally (buffering) for instant feedback.
   */
  const seek = useCallback((position: number, forceNewOffset: boolean = false) => {
    setAsyncPlaybackState(prev => prev ? { ...prev, state: 'buffering', anchorPosition: position, anchorTime: Date.now() } : prev);

    sendMessage({ 
      event: 'playback.seek', 
      payload: { position, scope: 'user', forceNewOffset } 
    });
    
    // Immediate heartbeat for seek to help transcoder start ASAP
    sendMessage({
      event: 'sync.heartbeat',
      payload: {
        position,
        playing: false,
        playbackRate: asyncPlaybackState?.playbackRate || 1,
        resolution: activeResolutionRef.current as any
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
    toggleAsyncMode,
    forceAsyncMode,
    play,
    pause,
    seek,
    setStatus,
    setRate
  };
}
