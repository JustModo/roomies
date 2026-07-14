import { useEffect, MutableRefObject, useRef } from 'react';
import { RoomState } from '../../../hooks/useRoomSync';
import { BufferedRange } from '../types';

interface UseVideoEventsParams {
  videoRef: MutableRefObject<HTMLVideoElement | null>;
  roomPlaybackState?: RoomState['playback'];
  localCorrectionRate?: number | null;
  syncSeekTrigger?: number;
  syncSeekPosition?: number;
  reportStatus: (status: 'ready' | 'buffering') => void;
  isDragging: boolean;
  isPlaying: boolean;
  setIsPlaying: (playing: boolean) => void;
  setCurrentTime: (time: number) => void;
  setDuration: (duration: number) => void;
  setBufferedRanges: (ranges: BufferedRange[]) => void;
  onReportTime: (time: number) => void;
  activeOffsetRef: MutableRefObject<number>;
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
}: UseVideoEventsParams) {
  const lastProcessedTriggerRef = useRef(0);

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
    if (videoRef.current) {
      const targetRate = localCorrectionRate ?? roomPlaybackState?.playbackRate ?? 1;
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

    lastProcessedTriggerRef.current = syncSeekTrigger;

    const transOffset = activeOffsetRef.current;
    console.log(`[playback] Executing sync seek to absolute ${syncSeekPosition} (relative: ${syncSeekPosition - transOffset})`);

    reportStatus('buffering');

    videoRef.current.currentTime = Math.max(0, syncSeekPosition - transOffset);
    setCurrentTime(syncSeekPosition);
  }, [syncSeekTrigger, syncSeekPosition, isDragging, reportStatus, setCurrentTime]);

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
      const bufferedAhead = getBufferedAhead(video);
      const remainingTime = video.duration ? (video.duration - video.currentTime) : 0;
      const threshold = video.duration ? Math.min(3.0, remainingTime) : 3.0;

      if (bufferedAhead >= threshold) {
        clearTimeout(bufferingTimeout);
        reportStatus('ready');
      }
    };

    const handleProgress = () => {
      handleReady();
    };

    video.addEventListener('waiting', handleWaiting);
    video.addEventListener('playing', handleReady);
    video.addEventListener('canplay', handleReady);
    video.addEventListener('progress', handleProgress);
    video.addEventListener('seeked', handleReady);

    return () => {
      clearTimeout(bufferingTimeout);
      video.removeEventListener('waiting', handleWaiting);
      video.removeEventListener('playing', handleReady);
      video.removeEventListener('canplay', handleReady);
      video.removeEventListener('progress', handleProgress);
      video.removeEventListener('seeked', handleReady);
    };
  }, [reportStatus]);

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
      const transOffset = activeOffsetRef.current;
      const absTime = video.currentTime + transOffset;
      if (!isDragging) {
        setCurrentTime(absTime);
      }
      onReportTime(absTime);
      setDuration(video.duration || 0);
      updateBufferedRanges();
    };

    const onProgress = () => {
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
