import { useCallback, useEffect, useLayoutEffect, useRef, MutableRefObject } from 'react';
import { PlaybackState, SyncStatus } from '@roomies/contracts';
import { Store } from '../../../lib/store';
import { BufferedRange, SeekCommand } from '../types';
import { absolutePlaybackTime, relativeStartPosition } from '../../../lib/hlsOffset';

interface UseVideoEventsParams {
  videoRef: MutableRefObject<HTMLVideoElement | null>;
  roomPlaybackState?: PlaybackState;
  localCorrectionRate?: number | null;
  seekCommand?: SeekCommand | null;
  reportStatus: (status: SyncStatus, force?: boolean) => void;
  isDragging: boolean;
  isPlaying: boolean;
  setIsPlaying: (playing: boolean) => void;
  timeStore: Store<number>;
  setDuration: (duration: number) => void;
  setBufferedRanges: (ranges: BufferedRange[]) => void;
  onReportTime: (time: number, flush?: boolean) => void;
  activeOffsetRef: MutableRefObject<number>;
  /** Set while waiting for useHlsPlayer to reinit against a corrected offset —
   *  freezes time/buffer reporting so the still-playing OLD source can't clobber
   *  the pending seek target before the reinit consumes it. */
  pendingReinitRef: MutableRefObject<boolean>;
  onAutoplayBlocked?: (blocked: boolean) => void;
  mediaDuration?: number;
}

const READY_AHEAD_S = 4;
const BUFFERING_DEBOUNCE_MS = 500;
const RANGE_MERGE_GAP_S = 2;

const readyThreshold = (absoluteTime: number, mediaDuration?: number): number =>
  mediaDuration ? Math.min(READY_AHEAD_S, Math.max(0, mediaDuration - absoluteTime)) : READY_AHEAD_S;

const getBufferedAhead = (vid: HTMLVideoElement): number => {
  const time = vid.currentTime;
  let maxEnd = time;
  for (let i = 0; i < vid.buffered.length; i++) {
    if (time >= vid.buffered.start(i) - 0.5 && time <= vid.buffered.end(i)) maxEnd = Math.max(maxEnd, vid.buffered.end(i));
  }
  return maxEnd - time;
};

function absoluteBufferedRanges(video: HTMLVideoElement, offset: number): BufferedRange[] {
  const ranges: BufferedRange[] = [];
  for (let i = 0; i < video.buffered.length; i++) ranges.push({ start: video.buffered.start(i) + offset, end: video.buffered.end(i) + offset });
  ranges.sort((a, b) => a.start - b.start);

  const merged: BufferedRange[] = [];
  for (const range of ranges) {
    const last = merged[merged.length - 1];
    if (last && range.start - last.end <= RANGE_MERGE_GAP_S) last.end = Math.max(last.end, range.end);
    else merged.push({ ...range });
  }

  const now = video.currentTime + offset;
  return merged.map((r) => (r.start > now && r.start - now <= 1 ? { ...r, start: now } : r));
}

const sameRanges = (a: BufferedRange[], b: BufferedRange[]) =>
  a.length === b.length && a.every((r, i) => Math.abs(r.start - b[i].start) < 0.25 && Math.abs(r.end - b[i].end) < 0.25);

export function useVideoEvents({
  videoRef,
  roomPlaybackState,
  localCorrectionRate,
  seekCommand,
  reportStatus,
  isDragging,
  isPlaying,
  setIsPlaying,
  timeStore,
  setDuration,
  setBufferedRanges,
  onReportTime,
  activeOffsetRef,
  pendingReinitRef,
  onAutoplayBlocked,
  mediaDuration,
}: UseVideoEventsParams) {
  const lastHandledSeekIdRef = useRef(-1);
  const pendingSeekRef = useRef<number | null>(null);
  const targetRateRef = useRef(1);
  const lastRangesRef = useRef<BufferedRange[]>([]);
  const latest = useRef({ state: roomPlaybackState?.state, isDragging, onAutoplayBlocked });

  useLayoutEffect(() => {
    latest.current = { state: roomPlaybackState?.state, isDragging, onAutoplayBlocked };
  });

  const publishRanges = useCallback(
    (ranges: BufferedRange[]) => {
      if (sameRanges(ranges, lastRangesRef.current)) return;
      lastRangesRef.current = ranges;
      setBufferedRanges(ranges);
    },
    [setBufferedRanges],
  );

  const syncPlayState = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    const { state, isDragging: dragging, onAutoplayBlocked: onBlocked } = latest.current;
    if (state === 'playing' && video.paused && !video.ended && !dragging) {
      video.play().then(
        () => onBlocked?.(false),
        (err: DOMException) => {
          if (err?.name === 'NotAllowedError') onBlocked?.(true);
          else if (err?.name !== 'AbortError') console.error('[playback] Play failed:', err);
        },
      );
    } else if (state !== 'playing' && !video.paused) {
      video.pause();
    }
  }, [videoRef]);

  useEffect(() => {
    syncPlayState();
  }, [roomPlaybackState?.state, isDragging, isPlaying, syncPlayState]);

  useEffect(() => {
    const targetRate = localCorrectionRate ?? roomPlaybackState?.playbackRate ?? 1;
    targetRateRef.current = targetRate;
    if (videoRef.current && videoRef.current.playbackRate !== targetRate) videoRef.current.playbackRate = targetRate;
  }, [videoRef, roomPlaybackState?.playbackRate, localCorrectionRate]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !seekCommand || seekCommand.id <= lastHandledSeekIdRef.current) return;
    lastHandledSeekIdRef.current = seekCommand.id;
    if (isDragging) return;

    const targetRelative = seekCommand.position - activeOffsetRef.current;
    timeStore.set(seekCommand.position);
    onReportTime(seekCommand.position);

    if (targetRelative < 0) {
      pendingReinitRef.current = true;
      lastRangesRef.current = [];
      setBufferedRanges([]);
      reportStatus('buffering');
      return;
    }

    if (video.readyState === 0) {
      pendingSeekRef.current = seekCommand.position;
      reportStatus('buffering');
      return;
    }

    const threshold = readyThreshold(seekCommand.position, mediaDuration);
    let isAlreadyBuffered = false;
    for (let i = 0; i < video.buffered.length; i++) {
      if (targetRelative >= video.buffered.start(i) && targetRelative <= video.buffered.end(i) - threshold) {
        isAlreadyBuffered = true;
        break;
      }
    }
    if (isAlreadyBuffered) reportStatus('ready', true);
    else reportStatus('buffering');
    video.currentTime = targetRelative;
  }, [videoRef, seekCommand, isDragging, reportStatus, timeStore, onReportTime, activeOffsetRef, pendingReinitRef, setBufferedRanges, mediaDuration]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    let bufferingTimeout: ReturnType<typeof setTimeout> | undefined;

    const checkAndReportReady = () => {
      if (video.playbackRate !== targetRateRef.current) video.playbackRate = targetRateRef.current;
      const threshold = readyThreshold(absolutePlaybackTime(video.currentTime, activeOffsetRef.current), mediaDuration);
      if (getBufferedAhead(video) >= threshold) {
        clearTimeout(bufferingTimeout);
        reportStatus('ready');
      }
    };

    const handleWaiting = () => {
      clearTimeout(bufferingTimeout);
      bufferingTimeout = setTimeout(() => reportStatus('buffering'), BUFFERING_DEBOUNCE_MS);
    };

    const handleStalled = () => {
      if (getBufferedAhead(video) < 0.5) handleWaiting();
    };

    const handleLoadedMetadata = () => {
      setDuration(video.duration || 0);
      if (pendingSeekRef.current === null) return;
      const targetRelative = relativeStartPosition(pendingSeekRef.current, activeOffsetRef.current);
      video.currentTime = targetRelative;
      timeStore.set(targetRelative + activeOffsetRef.current);
      pendingSeekRef.current = null;
    };

    const flushPosition = () => {
      if (!pendingReinitRef.current) onReportTime(absolutePlaybackTime(video.currentTime, activeOffsetRef.current), true);
    };

    const handleSeeked = () => {
      checkAndReportReady();
      flushPosition();
    };

    const handleCanPlay = () => {
      checkAndReportReady();
      syncPlayState();
    };

    const handlePlaying = () => {
      clearTimeout(bufferingTimeout);
      checkAndReportReady();
      flushPosition();
    };

    const handleProgress = () => {
      checkAndReportReady();
      if (video.readyState > 0 && !pendingReinitRef.current) publishRanges(absoluteBufferedRanges(video, activeOffsetRef.current));
    };

    const handleRateChange = () => {
      if (video.playbackRate !== targetRateRef.current) video.playbackRate = targetRateRef.current;
    };

    const handleEnded = () => {
      clearTimeout(bufferingTimeout);
      reportStatus('ready');
    };

    const handleDurationChange = () => setDuration(video.duration || 0);

    const handleTimeUpdate = () => {
      if (video.readyState === 0 || pendingReinitRef.current) return;
      const absTime = absolutePlaybackTime(video.currentTime, activeOffsetRef.current);
      video.dataset.absTime = String(absTime);
      if (!latest.current.isDragging && !video.seeking) {
        timeStore.set(absTime);
        onReportTime(absTime);
      }
      publishRanges(absoluteBufferedRanges(video, activeOffsetRef.current));
    };

    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => setIsPlaying(false);

    const listeners: [string, () => void][] = [
      ['loadedmetadata', handleLoadedMetadata],
      ['durationchange', handleDurationChange],
      ['waiting', handleWaiting],
      ['stalled', handleStalled],
      ['playing', handlePlaying],
      ['canplay', handleCanPlay],
      ['progress', handleProgress],
      ['seeked', handleSeeked],
      ['ratechange', handleRateChange],
      ['ended', handleEnded],
      ['timeupdate', handleTimeUpdate],
      ['play', handlePlay],
      ['pause', handlePause],
    ];
    listeners.forEach(([event, handler]) => video.addEventListener(event, handler));
    return () => {
      clearTimeout(bufferingTimeout);
      listeners.forEach(([event, handler]) => video.removeEventListener(event, handler));
    };
  }, [videoRef, reportStatus, timeStore, setDuration, setIsPlaying, onReportTime, activeOffsetRef, pendingReinitRef, publishRanges, syncPlayState, mediaDuration]);
}
