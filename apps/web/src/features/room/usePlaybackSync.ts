import { useState, useEffect, useRef, useCallback, useMemo, MutableRefObject } from 'react';
import { IncomingSocketMessage, OutgoingSocketMessage, PlaybackState, SyncStatus } from '@roomies/contracts';
import { INITIAL_PING, nextPingState, positionFromAnchor } from '../../lib/clock';
import { Store, useStoreValue } from '../../lib/store';
import { SeekCommand } from '../player/types';
import { RoomSyncState } from './roomStore';
import { useAsyncPlayback } from './useAsyncPlayback';

const HEARTBEAT_INTERVAL_MS = 5000;

export interface PlaybackApi {
  playback: PlaybackState | null;
  seekCommand: SeekCommand | null;
  correctionRate: number | null;
  isAsync: boolean;
  localTimeRef: MutableRefObject<number>;
  play(): void;
  pause(): void;
  seek(position: number): void;
  setRate(rate: number): void;
  setStatus(status: SyncStatus): void;
  reportTime(time: number, flush?: boolean): void;
  reportResolution(resolution: string): void;
  toggleAsync(): void;
}

interface UsePlaybackSyncParams {
  send: (message: IncomingSocketMessage) => void;
  store: Store<RoomSyncState>;
  isConnected: boolean;
}

export function usePlaybackSync({ send, store, isConnected }: UsePlaybackSyncParams) {
  const roomPlayback = useStoreValue(store, (s) => s.playback);
  const allowAsyncMode = useStoreValue(store, (s) => s.room?.settings.allowAsyncMode ?? true);

  const localTimeRef = useRef(0);
  const seekIdRef = useRef(0);
  const [seekCommand, setSeekCommand] = useState<SeekCommand | null>(null);
  const [correctionRate, setCorrectionRate] = useState<number | null>(null);
  const correctionTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const pingRef = useRef(INITIAL_PING);
  const activeResolutionRef = useRef<string | undefined>();
  const localStatusRef = useRef<SyncStatus>('ready');
  const hasInitializedRef = useRef(false);
  const pendingAsyncExitSeekRef = useRef(false);
  const activeRateRef = useRef(1);
  const isRoomPlayingRef = useRef(false);

  const getRoomPlayback = useCallback(() => store.get().playback, [store]);
  const async = useAsyncPlayback({ send, localTimeRef, getRoomPlayback });
  const { isAsyncRef, playbackRef: asyncPlaybackRef, setMode } = async;

  const positionNow = useCallback((playback: PlaybackState) => positionFromAnchor(playback, Date.now(), pingRef.current.clockOffset), []);

  const issueSeek = useCallback((position: number) => {
    seekIdRef.current += 1;
    setSeekCommand({ position, id: seekIdRef.current });
  }, []);

  const clearCorrection = useCallback(() => {
    clearTimeout(correctionTimerRef.current);
    setCorrectionRate(null);
  }, []);

  const setAsyncMode = useCallback(
    (enabled: boolean) => {
      if (enabled && !(store.get().room?.settings.allowAsyncMode ?? true)) return;
      if (!setMode(enabled)) return;
      if (enabled) {
        pendingAsyncExitSeekRef.current = false;
        clearCorrection();
        return;
      }
      const playback = store.get().playback;
      if (playback) {
        localTimeRef.current = positionNow(playback);
        pendingAsyncExitSeekRef.current = true;
      }
    },
    [store, setMode, clearCorrection, positionNow],
  );

  useEffect(() => {
    if (!allowAsyncMode && isAsyncRef.current) setAsyncMode(false);
  }, [allowAsyncMode, isAsyncRef, setAsyncMode]);

  const roomRate = roomPlayback?.playbackRate;
  useEffect(() => {
    clearCorrection();
  }, [roomRate, clearCorrection]);

  useEffect(() => () => clearTimeout(correctionTimerRef.current), []);

  useEffect(() => {
    activeRateRef.current = correctionRate ?? roomPlayback?.playbackRate ?? 1;
    isRoomPlayingRef.current = roomPlayback?.state === 'playing';
  }, [roomPlayback, correctionRate]);

  const sendHeartbeat = useCallback(
    (position: number = localTimeRef.current) => {
      const isAsync = isAsyncRef.current;
      const inFlightSeconds = !isAsync && isRoomPlayingRef.current ? ((pingRef.current.smoothed ?? 0) / 2000) * activeRateRef.current : 0;
      send({
        event: 'sync.heartbeat',
        payload: {
          position: position + inFlightSeconds,
          playbackRate: isAsync ? asyncPlaybackRef.current?.playbackRate ?? 1 : activeRateRef.current,
          resolution: activeResolutionRef.current as '360p' | '720p' | '1080p' | undefined,
          timestamp: Date.now(),
          pingQuality: pingRef.current.quality,
          status: isAsync ? 'async' : localStatusRef.current,
        },
      });
    },
    [send, isAsyncRef, asyncPlaybackRef],
  );

  useEffect(() => {
    if (!isConnected) {
      hasInitializedRef.current = false;
      return;
    }
    const interval = setInterval(() => sendHeartbeat(), HEARTBEAT_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [isConnected, sendHeartbeat]);

  const handleMessage = useCallback(
    (msg: OutgoingSocketMessage, prev: RoomSyncState) => {
      const isAsync = isAsyncRef.current;
      switch (msg.event) {
        case 'room.state': {
          const playback = store.get().playback;
          if (hasInitializedRef.current || isAsync || !playback) return;
          hasInitializedRef.current = true;
          localTimeRef.current = positionNow(playback);
          issueSeek(localTimeRef.current);
          return;
        }
        case 'playback.state': {
          if (isAsync) return;
          localTimeRef.current = positionNow(msg.payload);
          const isPending = msg.payload.state === 'buffering' || msg.payload.state === 'waiting';
          if (isPending && (msg.payload.action === undefined || msg.payload.action === 'seek')) issueSeek(localTimeRef.current);
          return;
        }
        case 'media.changed': {
          const { mediaFileId, hlsUrl, sessionScope } = msg.payload;
          if (!mediaFileId || !hlsUrl) return;
          if (isAsync && sessionScope !== 'user' && prev.mediaInfo?.mediaFileId !== mediaFileId) setAsyncMode(false);
          if (pendingAsyncExitSeekRef.current && !isAsync) {
            pendingAsyncExitSeekRef.current = false;
            issueSeek(localTimeRef.current);
          }
          return;
        }
        case 'sync.heartbeat_ack':
          pingRef.current = nextPingState(pingRef.current, msg.payload.timestamp, msg.payload.serverTime, Date.now());
          return;
        case 'sync.correct': {
          if (isAsync) return;
          const { seek, position, playbackRate, correctionDurationMs } = msg.payload;
          if (seek) {
            console.warn(`[sync] Hard seek correction: ${localTimeRef.current.toFixed(2)}s → ${position.toFixed(2)}s`);
            localTimeRef.current = position;
            issueSeek(position);
          }
          if (playbackRate === undefined) return;
          clearTimeout(correctionTimerRef.current);
          if (correctionDurationMs === undefined) {
            setCorrectionRate(null);
            return;
          }
          console.warn(`[sync] Soft rate correction: ${playbackRate}x for ${correctionDurationMs}ms`);
          setCorrectionRate(playbackRate);
          correctionTimerRef.current = setTimeout(() => setCorrectionRate(null), correctionDurationMs);
          return;
        }
      }
    },
    [store, isAsyncRef, positionNow, issueSeek, setAsyncMode],
  );

  const { play: asyncPlay, pause: asyncPause, seek: asyncSeek, setStatus: asyncSetStatus, setRate: asyncSetRate } = async;

  const play = useCallback(() => (isAsyncRef.current ? asyncPlay() : send({ event: 'playback.play', payload: {} })), [isAsyncRef, asyncPlay, send]);
  const pause = useCallback(() => (isAsyncRef.current ? asyncPause() : send({ event: 'playback.pause', payload: {} })), [isAsyncRef, asyncPause, send]);
  const setRate = useCallback(
    (rate: number) => (isAsyncRef.current ? asyncSetRate(rate) : send({ event: 'playback.set_rate', payload: { rate } })),
    [isAsyncRef, asyncSetRate, send],
  );

  const seek = useCallback(
    (position: number) => {
      localTimeRef.current = position;
      issueSeek(position);
      if (isAsyncRef.current) {
        asyncSeek(position);
        sendHeartbeat(position);
      } else {
        send({ event: 'playback.seek', payload: { position } });
      }
    },
    [isAsyncRef, asyncSeek, send, sendHeartbeat, issueSeek],
  );

  const setStatus = useCallback(
    (status: SyncStatus) => {
      localStatusRef.current = status;
      if (isAsyncRef.current) asyncSetStatus(status);
      else send({ event: 'sync.status', payload: { status } });
    },
    [isAsyncRef, asyncSetStatus, send],
  );

  const reportTime = useCallback(
    (time: number, flush = false) => {
      localTimeRef.current = time;
      if (flush) sendHeartbeat(time);
    },
    [sendHeartbeat],
  );

  const isConnectedRef = useRef(isConnected);
  useEffect(() => {
    isConnectedRef.current = isConnected;
  }, [isConnected]);

  const reportResolution = useCallback(
    (resolution: string) => {
      if (activeResolutionRef.current === resolution) return;
      activeResolutionRef.current = resolution;
      if (isConnectedRef.current) sendHeartbeat();
    },
    [sendHeartbeat],
  );

  const toggleAsync = useCallback(() => setAsyncMode(!isAsyncRef.current), [setAsyncMode, isAsyncRef]);

  const effectivePlayback = async.isAsync && async.playback ? async.playback : roomPlayback;

  const api = useMemo<PlaybackApi>(
    () => ({
      playback: effectivePlayback,
      seekCommand,
      correctionRate,
      isAsync: async.isAsync,
      localTimeRef,
      play,
      pause,
      seek,
      setRate,
      setStatus,
      reportTime,
      reportResolution,
      toggleAsync,
    }),
    [effectivePlayback, seekCommand, correctionRate, async.isAsync, play, pause, seek, setRate, setStatus, reportTime, reportResolution, toggleAsync],
  );

  return { api, handleMessage, isAsyncRef };
}
