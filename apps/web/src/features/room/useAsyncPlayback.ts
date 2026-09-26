import { useState, useCallback, useRef, MutableRefObject } from 'react';
import { IncomingSocketMessage, PlaybackState, SyncStatus } from '@roomies/contracts';

interface UseAsyncPlaybackParams {
  send: (message: IncomingSocketMessage) => void;
  localTimeRef: MutableRefObject<number>;
  getRoomPlayback: () => PlaybackState | null;
}

export function useAsyncPlayback({ send, localTimeRef, getRoomPlayback }: UseAsyncPlaybackParams) {
  const [isAsync, setIsAsync] = useState(false);
  const [playback, setPlayback] = useState<PlaybackState | null>(null);
  const isAsyncRef = useRef(false);
  const playbackRef = useRef<PlaybackState | null>(null);

  const commit = useCallback((next: PlaybackState | null) => {
    playbackRef.current = next;
    setPlayback(next);
  }, []);

  const patch = useCallback(
    (update: (current: PlaybackState) => PlaybackState) => {
      if (playbackRef.current) commit(update(playbackRef.current));
    },
    [commit],
  );

  const setMode = useCallback(
    (enabled: boolean): boolean => {
      if (enabled === isAsyncRef.current) return false;
      isAsyncRef.current = enabled;
      setIsAsync(enabled);
      if (enabled) {
        send({ event: 'sync.status', payload: { status: 'async' } });
        const room = getRoomPlayback();
        commit(room ? { ...room, anchorPosition: localTimeRef.current, anchorTime: Date.now() } : null);
      } else {
        send({ event: 'sync.status', payload: { status: 'buffering' } });
        commit(null);
      }
      return true;
    },
    [send, getRoomPlayback, localTimeRef, commit],
  );

  const play = useCallback(
    () => patch((p) => ({ ...p, state: 'playing', intendedState: 'playing', anchorPosition: localTimeRef.current, anchorTime: Date.now() })),
    [patch, localTimeRef],
  );

  const pause = useCallback(
    () => patch((p) => ({ ...p, state: 'paused', intendedState: 'paused', anchorPosition: localTimeRef.current, anchorTime: Date.now() })),
    [patch, localTimeRef],
  );

  const seek = useCallback(
    (position: number) => {
      patch((p) => ({ ...p, state: 'buffering', anchorPosition: position, anchorTime: Date.now() }));
      send({ event: 'playback.seek', payload: { position, scope: 'user' } });
    },
    [patch, send],
  );

  const setStatus = useCallback(
    (status: SyncStatus) =>
      patch((p) => ({ ...p, state: status === 'buffering' ? 'buffering' : p.intendedState, anchorPosition: localTimeRef.current, anchorTime: Date.now() })),
    [patch, localTimeRef],
  );

  const setRate = useCallback(
    (rate: number) => patch((p) => ({ ...p, playbackRate: rate, anchorPosition: localTimeRef.current, anchorTime: Date.now() })),
    [patch, localTimeRef],
  );

  return { isAsync, isAsyncRef, playback, playbackRef, setMode, play, pause, seek, setStatus, setRate };
}
