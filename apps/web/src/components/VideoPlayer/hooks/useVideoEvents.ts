import { useEffect, MutableRefObject, useRef } from 'react';
import { RoomState, SyncStatus } from '../../../hooks/useRoomSync';
import { BufferedRange } from '../types';

interface UseVideoEventsParams {
  videoRef: MutableRefObject<HTMLVideoElement | null>;
  roomPlaybackState?: RoomState['playback'];
  localCorrectionRate?: number | null;
  syncSeekTrigger?: number;
  syncSeekPosition?: number;
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

const getBufferedAhead = (vid: HTMLVideoElement) => {
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
  syncSeekTrigger = 0,
  syncSeekPosition = 0,
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
  const lastProcessedTriggerRef = useRef(0);
  const pendingSeekRef = useRef<number | null>(null);
  const targetRateRef = useRef(1);

  // Sync state changes from server (play/pause)
  useEffect(() => {
    if (!videoRef.current) return;
    if (roomPlaybackState?.state === 'playing' && !isPlaying && !isDragging) {
      videoRef.current.play().catch(err => console.error('[playback] Play failed:', err));
      setIsPlaying(true);
    } else if (roomPlaybackState?.state !== 'playing' && isPlaying) {
      videoRef.current.pause();
      setIsPlaying(false);
    }
  }, [roomPlaybackState?.state, isDragging, isPlaying, setIsPlaying]);

  // Sync playback rate
  useEffect(() => {
    const targetRate = localCorrectionRate ?? roomPlaybackState?.playbackRate ?? 1;
    targetRateRef.current = targetRate;

    if (videoRef.current) {
      if (videoRef.current.playbackRate !== targetRate) {
        videoRef.current.playbackRate = targetRate;
      }
    }
  }, [roomPlaybackState?.playbackRate, localCorrectionRate]);

  // Sync seek triggers
  useEffect(() => {
    if (syncSeekTrigger <= lastProcessedTriggerRef.current) return;

    if (isDragging) {
      lastProcessedTriggerRef.current = syncSeekTrigger;
      return;
    }

    if (!videoRef.current || syncSeekTrigger === 0) return;

    const transOffset = activeOffsetRef.current;
    const targetRelative = Math.max(0, syncSeekPosition - transOffset);

    // Defer explicit seeks if the video is completely unloaded or swapping sources.
    // The seek will be executed once loadedmetadata fires.
    if (videoRef.current.readyState === 0) {
      pendingSeekRef.current = targetRelative;
      lastProcessedTriggerRef.current = syncSeekTrigger;
      setCurrentTime(syncSeekPosition);
      onReportTime(syncSeekPosition);
      return;
    }

    lastProcessedTriggerRef.current = syncSeekTrigger;

    console.log(`[playback] Executing sync seek to absolute ${syncSeekPosition} (relative: ${targetRelative})`);

    
    // Check if the target position is already in memory
    let isBuffered = false;
    const buffered = videoRef.current.buffered;
    for (let i = 0; i < buffered.length; i++) {
      // Require at least 0.5 seconds of buffer ahead of the seek point to consider it "cached"
      if (targetRelative >= buffered.start(i) && targetRelative <= buffered.end(i) - 0.5) {
        isBuffered = true;
        break;
      }
    }

    if (!isBuffered) {
      reportStatus('buffering');
    } else {
      // Force report 'ready' to instantly acknowledge the explicit seek command
      reportStatus('ready', true);
    }

    videoRef.current.currentTime = targetRelative;
    setCurrentTime(syncSeekPosition);
    onReportTime(syncSeekPosition);
  }, [syncSeekTrigger, syncSeekPosition, isDragging, reportStatus, setCurrentTime, onReportTime]);

  // DOM Event Listeners
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    let bufferingTimeout: ReturnType<typeof setTimeout>;

    const handleWaiting = () => {
      clearTimeout(bufferingTimeout);
      bufferingTimeout = setTimeout(() => {
        reportStatus('buffering');
      }, 1500);
    };

    const handleReady = () => {
      // Re-assert playrate in case the browser loaded new metadata and reverted it to 1.0
      if (video.playbackRate !== targetRateRef.current) {
        video.playbackRate = targetRateRef.current;
      }

      const bufferedAhead = getBufferedAhead(video);
      const remainingTime = video.duration ? (video.duration - video.currentTime) : 0;
      const threshold = video.duration ? Math.min(0.5, remainingTime) : 0.5;

      if (bufferedAhead >= threshold) {
        clearTimeout(bufferingTimeout);
        reportStatus('ready');
      }
    };

    const handleProgress = () => {
      handleReady();
    };

    // Aggressively enforce playback rate against DOM resets
    const handleRateChange = () => {
      if (video.playbackRate !== targetRateRef.current) {
        video.playbackRate = targetRateRef.current;
      }
    };

    const handleEnded = () => {
      clearTimeout(bufferingTimeout);
      reportStatus('ready');
      onEnded?.();
    };

    const handleLoadedMetadata = () => {
      if (pendingSeekRef.current !== null) {
        console.log(`[playback] Executing deferred sync seek to relative ${pendingSeekRef.current}`);
        video.currentTime = pendingSeekRef.current;
        setCurrentTime(pendingSeekRef.current + activeOffsetRef.current);
        pendingSeekRef.current = null;
      }
    };

    video.addEventListener('loadedmetadata', handleLoadedMetadata);
    video.addEventListener('waiting', handleWaiting);
    video.addEventListener('playing', handleReady);
    video.addEventListener('canplay', handleReady);
    video.addEventListener('progress', handleProgress);
    video.addEventListener('seeked', handleReady);
    video.addEventListener('ratechange', handleRateChange);
    video.addEventListener('ended', handleEnded);

    return () => {
      clearTimeout(bufferingTimeout);
      video.removeEventListener('loadedmetadata', handleLoadedMetadata);
      video.removeEventListener('waiting', handleWaiting);
      video.removeEventListener('playing', handleReady);
      video.removeEventListener('canplay', handleReady);
      video.removeEventListener('progress', handleProgress);
      video.removeEventListener('seeked', handleReady);
      video.removeEventListener('ratechange', handleRateChange);
      video.removeEventListener('ended', handleEnded);
    };
  }, [reportStatus, onEnded]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const updateBufferedRanges = () => {
      const transOffset = activeOffsetRef.current;
      const rawRanges: { start: number, end: number }[] = [];
      for (let i = 0; i < video.buffered.length; i++) {
        rawRanges.push({
          start: video.buffered.start(i) + transOffset,
          end: video.buffered.end(i) + transOffset
        });
      }

      rawRanges.sort((a, b) => a.start - b.start);

      const mergedRanges: { start: number, end: number }[] = [];
      if (rawRanges.length > 0) {
        let current = rawRanges[0];
        for (let i = 1; i < rawRanges.length; i++) {
          const next = rawRanges[i];
          if (next.start - current.end <= 2.0) {
            current.end = Math.max(current.end, next.end);
          } else {
            mergedRanges.push(current);
            current = next;
          }
        }
        mergedRanges.push(current);
      }

      const curTime = video.currentTime + transOffset;
      const finalRanges = mergedRanges.map(range => {
        if (range.start > curTime && range.start - curTime <= 1.0) {
          return { ...range, start: curTime };
        }
        return range;
      });

      setBufferedRanges(finalRanges);
    };

    const onTimeUpdate = () => {
      if (video.readyState === 0) return;
      const transOffset = activeOffsetRef.current;
      const absTime = video.currentTime + transOffset;
      
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
