import React, { useState, useEffect, useRef, useCallback } from 'react';
import { VideoPlayerProps, BufferedRange } from './types';
import { useHlsPlayer } from './hooks/useHlsPlayer';
import { useVideoEvents } from './hooks/useVideoEvents';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import { usePlayerGestures } from './hooks/usePlayerGestures';
import { VideoOverlay } from './components/VideoOverlay';
import { SeekBar } from './components/SeekBar';
import { VideoControls } from './components/VideoControls';
import { useSubtitles, displaySubtitleLabel } from './hooks/useSubtitles';


export const VideoPlayer: React.FC<VideoPlayerProps> = ({
  mediaInfo,
  seekKey,
  roomPlaybackState,
  localTime,
  localCorrectionRate,
  syncSeekTrigger = 0,
  syncSeekPosition = 0,
  onPlay,
  onPause,
  onSeek,
  onSetRate,
  onStatusChange,
  onReportTime,
  showChat,
  onToggleChat,
  isFullscreen,
  children
}) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [idle, setIdle] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [bufferedRanges, setBufferedRanges] = useState<BufferedRange[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [dragProgress, setDragProgress] = useState(0);

  const videoRef = useRef<HTMLVideoElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout>>();
  const progressBarRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const isLocked = !mediaInfo || roomPlaybackState?.state === 'waiting';

  const onStatusChangeRef = useRef(onStatusChange);
  useEffect(() => {
    onStatusChangeRef.current = onStatusChange;
  }, [onStatusChange]);

  const lastReportedStatusRef = useRef<'ready' | 'buffering'>('ready');
  const reportStatus = useCallback((status: 'ready' | 'buffering') => {
    if (lastReportedStatusRef.current !== status) {
      lastReportedStatusRef.current = status;
      onStatusChangeRef.current(status);
    }
  }, []);

  // Cleanup effect
  useEffect(() => {
    if (!mediaInfo) {
      setCurrentTime(0);
      setDuration(0);
      setBufferedRanges([]);
      setIsPlaying(false);
      setDragProgress(0);
    }
  }, [mediaInfo]);

  const lastShowTimeRef = useRef<number>(0);
  const manuallyHiddenTimeRef = useRef<number>(0);

  const showControls = useCallback(() => {
    // Prevent synthetic events from waking it up right after hiding
    if (Date.now() - manuallyHiddenTimeRef.current < 500) return;
    
    setIdle((prevIdle) => {
      if (prevIdle) {
        lastShowTimeRef.current = Date.now();
      }
      return false;
    });

    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      setIdle(true);
    }, 3000);
  }, []);

  const hideControls = useCallback(() => {
    manuallyHiddenTimeRef.current = Date.now();
    setIdle(true);
    clearTimeout(timerRef.current);
  }, []);

  // Idle Timer — also resets on touch so mobile users can interact
  useEffect(() => {
    window.addEventListener('mousemove', showControls);
    window.addEventListener('keydown', showControls);
    window.addEventListener('touchstart', showControls, { passive: true });
    showControls();

    return () => {
      window.removeEventListener('mousemove', showControls);
      window.removeEventListener('keydown', showControls);
      window.removeEventListener('touchstart', showControls);
      clearTimeout(timerRef.current);
    };
  }, [showControls]);

  const { levels, currentLevel, handleQualityChange } = useHlsPlayer({
    videoRef,
    mediaInfo,
    seekKey,
    localTime,
    roomPlaybackState,
    reportStatus,
    setIsPlaying,
  });

  const { subtitleUrls, activeSubtitleId, setActiveSubtitleId } = useSubtitles({ mediaInfo, videoRef });

  useVideoEvents({
    videoRef,
    mediaInfo,
    roomPlaybackState,
    localCorrectionRate,
    syncSeekTrigger,
    syncSeekPosition,
    reportStatus,
    isDragging,
    isPlaying,
    setIsPlaying,
    setCurrentTime,
    setDuration,
    setBufferedRanges,
    onReportTime,
  });

  const handlePlayPause = useCallback(() => {
    if (isLocked) return;
    if (roomPlaybackState?.state === 'playing') {
      onPause();
    } else {
      onPlay();
    }
  }, [roomPlaybackState?.state, onPlay, onPause, isLocked]);

  const handleSeekOffset = useCallback((offset: number) => {
    if (isLocked) return;
    if (!videoRef.current) return;
    const transOffset = mediaInfo?.transcodeOffset || 0;
    const currentAbsolute = videoRef.current.currentTime + transOffset;
    const newPos = Math.max(0, currentAbsolute + offset);
    videoRef.current.currentTime = Math.max(0, newPos - transOffset);
    onSeek(newPos);
  }, [mediaInfo?.transcodeOffset, onSeek, isLocked]);

  useKeyboardShortcuts({ handlePlayPause, handleSeekOffset });

  usePlayerGestures({
    videoRef,
    containerRef,
    isLocked,
    isPlaying,
    playbackRate: roomPlaybackState?.playbackRate || 1,
    isMuted,
    setIsMuted,
    onPlay,
    onPause,
    onSeek,
    onSetRate,
    idle,
    showControls,
    hideControls,
    lastShowTimeRef,
    mediaDuration: mediaInfo?.duration || duration,
    transcodeOffset: mediaInfo?.transcodeOffset || 0,
  });

  const formatTime = (seconds: number) => {
    if (isNaN(seconds)) return '0:00';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    if (h > 0) {
      return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    }
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const cyclePlaybackRate = () => {
    if (isLocked) return;
    const rates = [0.5, 1, 1.25, 1.5, 2];
    const currentRate = roomPlaybackState?.playbackRate || 1;
    const next = rates[(rates.indexOf(currentRate) + 1) % rates.length];
    onSetRate(next);
  };

  // Scrubbing Logic
  const updateDragProgress = (clientX: number) => {
    if (!progressBarRef.current) return;
    const rect = progressBarRef.current.getBoundingClientRect();
    let pos = (clientX - rect.left) / rect.width;
    pos = Math.max(0, Math.min(1, pos));
    setDragProgress(pos);
    const totalDuration = mediaInfo?.duration || duration;
    setCurrentTime(pos * totalDuration);
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (isLocked) return;
    const totalDuration = mediaInfo?.duration || duration;
    if (!totalDuration) return;
    setIsDragging(true);
    updateDragProgress(e.clientX);
    if (isPlaying && videoRef.current) videoRef.current.pause();
  };

  useEffect(() => {
    if (isDragging) {
      const handlePointerMove = (e: PointerEvent) => {
        updateDragProgress(e.clientX);
      };
      const handlePointerUp = (e: PointerEvent) => {
        setIsDragging(false);
        let pos = dragProgress;
        if (progressBarRef.current) {
          const rect = progressBarRef.current.getBoundingClientRect();
          pos = (e.clientX - rect.left) / rect.width;
          pos = Math.max(0, Math.min(1, pos));
          setDragProgress(pos);
          setCurrentTime(pos * (mediaInfo?.duration || duration));
        }
        const totalDuration = mediaInfo?.duration || duration;
        const newPos = pos * totalDuration;
        onSeek(newPos);
        if (videoRef.current) {
          const transOffset = mediaInfo?.transcodeOffset || 0;
          videoRef.current.currentTime = Math.max(0, newPos - transOffset);
        }
      };

      window.addEventListener('pointermove', handlePointerMove);
      window.addEventListener('pointerup', handlePointerUp);
      return () => {
        window.removeEventListener('pointermove', handlePointerMove);
        window.removeEventListener('pointerup', handlePointerUp);
      };
    }
  }, [isDragging, dragProgress, duration, mediaInfo?.duration, mediaInfo?.transcodeOffset, onSeek]);

  const totalDuration = mediaInfo?.duration || duration;
  const progressPercent = totalDuration > 0 ? (currentTime / totalDuration) * 100 : 0;
  const uiVisible = !idle || !isPlaying || isDragging;

  useEffect(() => {
    window.dispatchEvent(new CustomEvent('player-controls-toggle', { detail: { visible: uiVisible } }));
  }, [uiVisible]);

  return (
    <div ref={containerRef} className="relative w-full h-full bg-ink overflow-hidden text-paper flex flex-col justify-center">
      <video
        ref={videoRef}
        className="w-full h-full object-contain bg-ink"
        poster="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='100%25' height='100%25'%3E%3Crect width='100%25' height='100%25' fill='%23000000'/%3E%3C/svg%3E"
        muted={isMuted}
      >
        {(mediaInfo?.subtitles || []).map((sub) => (
          subtitleUrls[sub.id] ? (
            <track
              id={sub.id}
              key={sub.id}
              kind="subtitles"
              src={subtitleUrls[sub.id]}
              srcLang={sub.language ?? 'und'}
              label={displaySubtitleLabel(sub.language)}
            />
          ) : null
        ))}
      </video>

      <VideoOverlay
        mediaInfo={mediaInfo}
        roomPlaybackState={roomPlaybackState}
        isPlaying={isPlaying}
        isDragging={isDragging}
      />

      {/* Top Bar Container passed as children */}
      <div className={`absolute top-0 left-0 w-full z-50 transition-opacity duration-200 no-gestures ${uiVisible ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
        {children}
      </div>

      {/* Bottom Controls */}
      <div className={`absolute bottom-0 left-0 w-full z-50 transition-opacity duration-200 bg-gradient-to-t from-ink/90 via-ink/60 to-transparent flex flex-col no-gestures ${uiVisible ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
        <SeekBar
          ref={progressBarRef}
          isLocked={isLocked}
          bufferedRanges={bufferedRanges}
          progressPercent={progressPercent}
          totalDuration={totalDuration}
          isDragging={isDragging}
          onPointerDown={handlePointerDown}
        />

        <VideoControls
          isLocked={isLocked}
          roomPlaybackState={roomPlaybackState}
          isMuted={isMuted}
          setIsMuted={setIsMuted}
          currentTime={currentTime}
          totalDuration={totalDuration}
          formatTime={formatTime}
          handlePlayPause={handlePlayPause}
          handleSeekOffset={handleSeekOffset}
          cyclePlaybackRate={cyclePlaybackRate}
          levels={levels}
          currentLevel={currentLevel}
          handleQualityChange={handleQualityChange}
          showChat={showChat}
          onToggleChat={onToggleChat}
          isFullscreen={isFullscreen}
          mediaInfo={mediaInfo}
          activeSubtitleId={activeSubtitleId}
          setActiveSubtitleId={setActiveSubtitleId}
          displaySubtitleLabel={displaySubtitleLabel}
        />
      </div>
    </div>
  );
};
