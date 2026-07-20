import { useState, useCallback, useEffect, useRef, MutableRefObject } from 'react';
import { RoomState } from '@roomies/contracts';
import { WEB_CONFIG } from '../config';

interface UseAsyncPlaybackParams {
  isConnected: boolean;
  sendMessage: (msg: any) => void;
  localTimeRef: MutableRefObject<number>;
  activeResolutionRef: MutableRefObject<string | undefined>;
  roomPlaybackState?: RoomState['playback'];
  allowAsyncMode?: boolean;
}

export function useAsyncPlayback({
  isConnected,
  sendMessage,
  localTimeRef,
  activeResolutionRef,
  roomPlaybackState,
  allowAsyncMode = true,
}: UseAsyncPlaybackParams) {
  const [isAsyncMode, setIsAsyncMode] = useState(false);
  const isAsyncModeRef = useRef(false);

  const [asyncPlaybackState, setAsyncPlaybackState] = useState<RoomState['playback'] | null>(null);
  // Keep a ref so the heartbeat interval always reads the latest value without stale closures.
  const asyncPlaybackStateRef = useRef<RoomState['playback'] | null>(null);

  useEffect(() => {
    asyncPlaybackStateRef.current = asyncPlaybackState;
  }, [asyncPlaybackState]);

  // Periodic heartbeat so the transcoder knows where the async user is.
  useEffect(() => {
    if (!isConnected) return;

    const interval = setInterval(() => {
      if (!isAsyncModeRef.current) return;
      const ps = asyncPlaybackStateRef.current;
      sendMessage({
        event: 'sync.heartbeat',
        payload: {
          position: localTimeRef.current,
          playing: ps?.state === 'playing',
          playbackRate: ps?.playbackRate ?? 1,
          resolution: activeResolutionRef.current as any,
          status: 'async' as const,
        }
      });
    }, WEB_CONFIG.ASYNC_HEARTBEAT_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [isConnected, sendMessage, localTimeRef, activeResolutionRef]);

  const forceAsyncMode = useCallback((enabled: boolean) => {
    if (enabled && !allowAsyncMode) return;
    setIsAsyncMode(prev => {
      if (prev === enabled) return prev;
      isAsyncModeRef.current = enabled;

      if (enabled) {
        sendMessage({ event: 'sync.status', payload: { status: 'async' as any } });
        const snap = roomPlaybackState ? {
          ...roomPlaybackState,
          anchorPosition: localTimeRef.current,
          anchorTime: Date.now(),
        } : null;
        setAsyncPlaybackState(snap);
        asyncPlaybackStateRef.current = snap;
      } else {
        sendMessage({ event: 'sync.status', payload: { status: 'ready' } });
        setAsyncPlaybackState(null);
        asyncPlaybackStateRef.current = null;
      }
      return enabled;
    });
  }, [sendMessage, roomPlaybackState, localTimeRef, allowAsyncMode]);

  // Auto-enforce room setting: force back to room sync if admin disables async mode.
  useEffect(() => {
    if (!allowAsyncMode && isAsyncModeRef.current) {
      forceAsyncMode(false);
    }
  }, [allowAsyncMode, forceAsyncMode]);

  const toggleAsyncMode = useCallback(() => {
    forceAsyncMode(!isAsyncModeRef.current);
  }, [forceAsyncMode]);

  const play = useCallback(() => {
    setAsyncPlaybackState(prev => {
      if (!prev) return prev;
      const next = { ...prev, state: 'playing' as const, intendedState: 'playing' as const, anchorPosition: localTimeRef.current, anchorTime: Date.now() };
      asyncPlaybackStateRef.current = next;
      return next;
    });
  }, [localTimeRef]);

  const pause = useCallback(() => {
    setAsyncPlaybackState(prev => {
      if (!prev) return prev;
      const next = { ...prev, state: 'paused' as const, intendedState: 'paused' as const, anchorPosition: localTimeRef.current, anchorTime: Date.now() };
      asyncPlaybackStateRef.current = next;
      return next;
    });
  }, [localTimeRef]);

  /**
   * Seek in async mode — sends the request to the server, which uses the same
   * coordinator as sync to decide whether a transcode reinit is needed.
   * The server responds with a user-scoped `media.changed` containing the
   * resolved transcodeOffset. HLS reinits only when offset actually changes.
   */
  const seek = useCallback((position: number, forceNewOffset: boolean = false) => {
    setAsyncPlaybackState(prev => {
      if (!prev) return prev;
      const next = { ...prev, state: 'buffering' as const, anchorPosition: position, anchorTime: Date.now() };
      asyncPlaybackStateRef.current = next;
      return next;
    });

    sendMessage({
      event: 'playback.seek',
      payload: { position, scope: 'user', forceNewOffset }
    });

    // Immediate heartbeat so the transcoder starts ASAP.
    sendMessage({
      event: 'sync.heartbeat',
      payload: {
        position,
        playing: false,
        playbackRate: asyncPlaybackStateRef.current?.playbackRate ?? 1,
        resolution: activeResolutionRef.current as any,
        status: 'async' as const,
      }
    });
  }, [sendMessage, activeResolutionRef]);

  const setStatus = useCallback((status: 'ready' | 'buffering') => {
    setAsyncPlaybackState(prev => {
      if (!prev) return prev;
      const next = {
        ...prev,
        state: (status === 'buffering' ? 'buffering' : prev.intendedState) as RoomState['playback']['state'],
        anchorPosition: localTimeRef.current,
        anchorTime: Date.now()
      };
      asyncPlaybackStateRef.current = next;
      return next;
    });
  }, [localTimeRef]);

  const setRate = useCallback((rate: number) => {
    setAsyncPlaybackState(prev => {
      if (!prev) return prev;
      const next = { ...prev, playbackRate: rate, anchorPosition: localTimeRef.current, anchorTime: Date.now() };
      asyncPlaybackStateRef.current = next;
      return next;
    });
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
