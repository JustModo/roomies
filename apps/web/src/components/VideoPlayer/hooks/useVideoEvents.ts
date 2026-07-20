import { useEffect, MutableRefObject, useRef } from 'react';
import { RoomState, SyncStatus } from '@roomies/contracts';
import { BufferedRange, SeekCommand } from '../types';

interface UseVideoEventsParams {
  videoRef: MutableRefObject<HTMLVideoElement | null>;
  roomPlaybackState?: RoomState['playback'];
  localCorrectionRate?: number | null;
  /** Replaces the old syncSeekTrigger + syncSeekPosition pair. */
  seekCommand?: SeekCommand | null;
  reportStatus: (status: SyncStatus, force?: boolean) => void;
  isDragging: boolean;
  isPlaying: boolean;
  setIsPlaying: (playing: boolean) => void;
  setCurrentTime: (time: number) => void;
  setDuration: (duration: number) => void;
  setBufferedRanges: (ranges: BufferedRange[]) => void;
  onReportTime: (time: number) => void;
  activeOffsetRef: MutableRefObject<number>;
  onEnded?: () => void;
}

/** Returns how many seconds are buffered ahead of the current playhead. */
const getBufferedAhead = (vid: HTMLVideoElement): number => {
  const time = vid.currentTime;
  let maxEnd = time;
  for (let i = 0; i < vid.buffered.length; i++) {
    const start = vid.buffered.start(i);
    const end = vid.buffered.end(i);
    if (time >= start - 0.5 && time <= end) {
      maxEnd = Math.max(maxEnd, end);
    }
  }
  return maxEnd - time;
};

export function useVideoEvents({
  videoRef,
  roomPlaybackState,
  localCorrectionRate,
  seekCommand,
  reportStatus,
  isDragging,
  isPlaying,
  setIsPlaying,
  setCurrentTime,
  setDuration,
  setBufferedRanges,
  onReportTime,
  activeOffsetRef,
  onEnded,
}: UseVideoEventsParams) {
  const lastHandledSeekIdRef = useRef(-1);
  const pendingSeekRef = useRef<number | null>(null);
  const targetRateRef = useRef(1);

  // ── Play / Pause ──────────────────────────────────────────────────────────
  // Driven entirely by the room playback state. We do not locally call play()
  // or pause() in response to user input — that goes through the server first.
  useEffect(() => {
    if (!videoRef.current) return;
    const state = roomPlaybackState?.state;

    if (state === 'playing' && !isPlaying && !isDragging) {
      videoRef.current.play().catch(err => console.error('[playback] Play failed:', err));
    } else if (state !== 'playing' && isPlaying) {
      videoRef.current.pause();
    }
  }, [roomPlaybackState?.state, isDragging, isPlaying]);

  // ── Playback Rate ─────────────────────────────────────────────────────────
  useEffect(() => {
    const targetRate = localCorrectionRate ?? roomPlaybackState?.playbackRate ?? 1;
    targetRateRef.current = targetRate;
    if (videoRef.current && videoRef.current.playbackRate !== targetRate) {
      videoRef.current.playbackRate = targetRate;
    }
  }, [roomPlaybackState?.playbackRate, localCorrectionRate]);

  // ── Seek Command ──────────────────────────────────────────────────────────
  // Handles explicit seeks issued by the sync system (on seek, join, buffering).
  // Uses seekCommand.id to deduplicate — a seek is only ever executed once
  // regardless of re-renders or React StrictMode double-invocations.
  useEffect(() => {
    if (!seekCommand) return;
    if (seekCommand.id <= lastHandledSeekIdRef.current) return;

    // Mark handled immediately to prevent re-entry.
    lastHandledSeekIdRef.current = seekCommand.id;

    if (isDragging) return; // Don't interrupt scrubbing.

    const video = videoRef.current;
    const transOffset = activeOffsetRef.current;
    const targetRelative = Math.max(0, seekCommand.position - transOffset);

    // Update UI time immediately for instant feedback.
    setCurrentTime(seekCommand.position);
    onReportTime(seekCommand.position);

    if (!video) return;

    // If the video source isn't loaded yet, defer the seek to loadedmetadata.
    if (video.readyState === 0) {
      pendingSeekRef.current = targetRelative;
      return;
    }

    // Check if the target position is already in the buffer.
    let isAlreadyBuffered = false;
    const buffered = video.buffered;
    for (let i = 0; i < buffered.length; i++) {
      if (targetRelative >= buffered.start(i) && targetRelative <= buffered.end(i) - 0.5) {
        isAlreadyBuffered = true;
        break;
      }
    }

    if (isAlreadyBuffered) {
      // Already have data — report ready immediately, no buffering spinner needed.
      reportStatus('ready', true);
    } else {
      reportStatus('buffering');
    }

    console.log(`[playback] Seek to abs=${seekCommand.position.toFixed(2)} rel=${targetRelative.toFixed(2)} (buffered=${isAlreadyBuffered})`);
    video.currentTime = targetRelative;
  }, [seekCommand, isDragging, reportStatus, setCurrentTime, onReportTime]);

  // ── DOM Event Listeners (status + time tracking) ──────────────────────────
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    let bufferingTimeout: ReturnType<typeof setTimeout>;

    /**
     * Check buffer ahead and report ready if there's enough data.
     * This is the single source-of-truth for reporting 'ready'.
     */
    const checkAndReportReady = () => {
      if (video.playbackRate !== targetRateRef.current) {
        video.playbackRate = targetRateRef.current;
      }

      const bufferedAhead = getBufferedAhead(video);
      const remainingTime = video.duration ? Math.max(0, video.duration - video.currentTime) : Infinity;
      const threshold = Math.min(0.5, remainingTime);

      if (bufferedAhead >= threshold) {
        clearTimeout(bufferingTimeout);
        reportStatus('ready');
      }
    };

    const handleWaiting = () => {
      clearTimeout(bufferingTimeout);
      // Short debounce to ignore brief stalls that resolve immediately.
      bufferingTimeout = setTimeout(() => {
        reportStatus('buffering');
      }, 500);
    };

    const handleLoadedMetadata = () => {
      if (pendingSeekRef.current !== null) {
        console.log(`[playback] Executing deferred seek to rel=${pendingSeekRef.current.toFixed(2)}`);
        video.currentTime = pendingSeekRef.current;
        setCurrentTime(pendingSeekRef.current + activeOffsetRef.current);
        pendingSeekRef.current = null;
      }
    };

    const handleSeeked = () => checkAndReportReady();
    const handleCanPlay = () => checkAndReportReady();
    const handlePlaying = () => {
      clearTimeout(bufferingTimeout);
      checkAndReportReady();
    };
    const handleProgress = () => checkAndReportReady();

    const handleRateChange = () => {
      // Browser may reset playbackRate (e.g. after src change); re-assert it.
      if (video.playbackRate !== targetRateRef.current) {
        video.playbackRate = targetRateRef.current;
      }
    };

    const handleEnded = () => {
      clearTimeout(bufferingTimeout);
      reportStatus('ready');
      onEnded?.();
    };

    video.addEventListener('loadedmetadata', handleLoadedMetadata);
    video.addEventListener('waiting', handleWaiting);
    video.addEventListener('playing', handlePlaying);
    video.addEventListener('canplay', handleCanPlay);
    video.addEventListener('progress', handleProgress);
    video.addEventListener('seeked', handleSeeked);
    video.addEventListener('ratechange', handleRateChange);
    video.addEventListener('ended', handleEnded);

    return () => {
      clearTimeout(bufferingTimeout);
      video.removeEventListener('loadedmetadata', handleLoadedMetadata);
      video.removeEventListener('waiting', handleWaiting);
      video.removeEventListener('playing', handlePlaying);
      video.removeEventListener('canplay', handleCanPlay);
      video.removeEventListener('progress', handleProgress);
      video.removeEventListener('seeked', handleSeeked);
      video.removeEventListener('ratechange', handleRateChange);
      video.removeEventListener('ended', handleEnded);
    };
  }, [reportStatus, onEnded, setCurrentTime]);

  // ── Time Update & Buffer Tracking ─────────────────────────────────────────
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const updateBufferedRanges = () => {
      const transOffset = activeOffsetRef.current;
      const rawRanges: { start: number; end: number }[] = [];
      for (let i = 0; i < video.buffered.length; i++) {
        rawRanges.push({
          start: video.buffered.start(i) + transOffset,
          end: video.buffered.end(i) + transOffset,
        });
      }

      rawRanges.sort((a, b) => a.start - b.start);

      const merged: { start: number; end: number }[] = [];
      if (rawRanges.length > 0) {
        let cur = rawRanges[0];
        for (let i = 1; i < rawRanges.length; i++) {
          const next = rawRanges[i];
          if (next.start - cur.end <= 2.0) {
            cur.end = Math.max(cur.end, next.end);
          } else {
            merged.push(cur);
            cur = next;
          }
        }
        merged.push(cur);
      }

      const curTime = video.currentTime + transOffset;
      const final = merged.map(r =>
        r.start > curTime && r.start - curTime <= 1.0 ? { ...r, start: curTime } : r
      );
      setBufferedRanges(final);
    };

    const onTimeUpdate = () => {
      if (video.readyState === 0) return;
      const absTime = video.currentTime + activeOffsetRef.current;
      if (!isDragging && !video.seeking) {
        setCurrentTime(absTime);
        onReportTime(absTime);
      }
      setDuration(video.duration || 0);
      updateBufferedRanges();
    };

    const onProgress = () => {
      if (video.readyState === 0) return;
      updateBufferedRanges();
    };

    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => setIsPlaying(false);

    video.addEventListener('timeupdate', onTimeUpdate);
    video.addEventListener('progress', onProgress);
    video.addEventListener('play', handlePlay);
    video.addEventListener('pause', handlePause);

    return () => {
      video.removeEventListener('timeupdate', onTimeUpdate);
      video.removeEventListener('progress', onProgress);
      video.removeEventListener('play', handlePlay);
      video.removeEventListener('pause', handlePause);
    };
  }, [isDragging, setCurrentTime, setDuration, setBufferedRanges, setIsPlaying, onReportTime]);
}
