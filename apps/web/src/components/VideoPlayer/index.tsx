import React, { useState, useEffect, useRef, useCallback } from 'react';

import { VideoPlayerProps, BufferedRange } from './types';
import { absolutePlaybackTime } from './hlsOffset';
import { useHlsPlayer } from './hooks/useHlsPlayer';
import { useVideoEvents } from './hooks/useVideoEvents';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import { usePlayerGestures } from './hooks/usePlayerGestures';
import { VideoOverlay } from './components/VideoOverlay';
import { SeekBar } from './components/SeekBar';
import { VideoControls } from './components/VideoControls';
import { SubtitleOverlay } from './components/SubtitleOverlay';
import { FloatingEmoji } from './components/FloatingEmoji';
import { EmojiReactions } from './components/EmojiReactions';
import { useSubtitles, displaySubtitleLabel } from './hooks/useSubtitles';
import { useChat } from '../../contexts/ChatContext';

import { SyncStatus } from '@roomies/contracts';

export const VideoPlayer: React.FC<VideoPlayerProps> = ({
  mediaInfo,
  seekKey,
  roomPlaybackState,
  localTime,
  localCorrectionRate,
  seekCommand,
  onPlay,
  onPause,
  onSeek,
  onSetRate,
  onStatusChange,
  onReportTime,
  onReportResolution,
  onVolumeChange,
  showChat = false,
  onToggleChat,
  isFullscreen = false,
  onToggleFullscreen,
  isAsyncMode = false,
  onToggleAsync,
  allowAsyncMode = true,
  isLockedByAdmin = false,
  children,
}) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [volume, setVolume] = useState(1);
  const [idle, setIdle] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [bufferedRanges, setBufferedRanges] = useState<BufferedRange[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [dragProgress, setDragProgress] = useState(0);
  const [isSelfLocked, setIsSelfLocked] = useState(false);
  const [settingsMenuOpen, setSettingsMenuOpen] = useState(false);
  // iOS refuses play() outside a user gesture; we surface a tap target instead.
  const [autoplayBlocked, setAutoplayBlocked] = useState(false);

  // Floating emoji state
  const [floatingEmojis, setFloatingEmojis] = useState<Array<{ id: string; emoji: string; username: string }>>([]);

  const { emojiMuted } = useChat();

  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.volume = volume;
    }
    onVolumeChange?.(volume);
  }, [volume, onVolumeChange]);

  const activeOffsetRef = useRef<number>(0);
  const pendingReinitRef = useRef<boolean>(false);
  const timerRef = useRef<ReturnType<typeof setTimeout>>();
  const progressBarRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const activeLockByAdmin = isLockedByAdmin && !isAsyncMode;
  const isServerLocked = !mediaInfo || roomPlaybackState?.state === 'waiting' || roomPlaybackState?.state === 'buffering' || activeLockByAdmin;
  const isLocked = isServerLocked || isSelfLocked;

  const onStatusChangeRef = useRef(onStatusChange);
  useEffect(() => {
    onStatusChangeRef.current = onStatusChange;
  }, [onStatusChange]);

  const lastReportedStatusRef = useRef<SyncStatus>('ready');
  const reportStatus = useCallback((status: SyncStatus, force = false) => {
    if (force || lastReportedStatusRef.current !== status) {
      lastReportedStatusRef.current = status;
      onStatusChangeRef.current(status);
    }
  }, []);

  // Cleanup on media unload.
  useEffect(() => {
    if (!mediaInfo) {
      setCurrentTime(0);
      setDuration(0);
      setBufferedRanges([]);
      setIsPlaying(false);
      setDragProgress(0);
    }
  }, [mediaInfo]);

  // Self-lock is per-media; clear it whenever the active media changes (including to none).
  const lastLockedMediaIdRef = useRef<string | undefined>(mediaInfo?.mediaFileId);
  useEffect(() => {
    if (lastLockedMediaIdRef.current !== mediaInfo?.mediaFileId) {
      lastLockedMediaIdRef.current = mediaInfo?.mediaFileId;
      setIsSelfLocked(false);
    }
  }, [mediaInfo?.mediaFileId]);

  // Listen for emoji reactions from other users
  useEffect(() => {
    const handleEmoji = (e: CustomEvent) => {
      if (emojiMuted) return;
      const { userId, username, emoji, timestamp } = e.detail;
      const id = `${userId}-${timestamp}`;
      console.log(`[VideoPlayer] Received emoji event:`, { userId, username, emoji, timestamp, id });
      setFloatingEmojis(prev => [...prev, { id, emoji, username }]);
    };

    window.addEventListener('roomies:emoji', handleEmoji as EventListener);
    return () => window.removeEventListener('roomies:emoji', handleEmoji as EventListener);
  }, [emojiMuted]);

  const removeFloatingEmoji = useCallback((id: string) => {
    console.log(`[VideoPlayer] removeFloatingEmoji called for id="${id}"`);
    setFloatingEmojis(prev => {
      const next = prev.filter(e => e.id !== id);
      console.log(`[VideoPlayer] Floating emojis: ${prev.length} -> ${next.length}`);
      return next;
    });
  }, []);

  // ── Idle / Controls Visibility ─────────────────────────────────────────────

  const lastShowTimeRef = useRef<number>(0);
  const manuallyHiddenTimeRef = useRef<number>(0);

  const showControls = useCallback(() => {
    if (Date.now() - manuallyHiddenTimeRef.current < 500) return;
    setIdle(prevIdle => {
      if (prevIdle) lastShowTimeRef.current = Date.now();
      return false;
    });
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setIdle(true), 3000);
  }, []);

  const hideControls = useCallback(() => {
    manuallyHiddenTimeRef.current = Date.now();
    setIdle(true);
    clearTimeout(timerRef.current);
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.target instanceof HTMLElement && e.target.isContentEditable) return;
      showControls();
    };
    window.addEventListener('keydown', handleKeyDown);
    showControls();
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      clearTimeout(timerRef.current);
    };
  }, [showControls]);

  // ── HLS Player ────────────────────────────────────────────────────────────

  const { levels, currentLevel, handleQualityChange, activeResolution, audioTracks, currentAudioTrack, handleAudioTrackChange } = useHlsPlayer({
    videoRef,
    mediaInfo,
    seekKey,
    localTime,
    roomPlaybackState,
    reportStatus,
    setIsPlaying,
    isAsyncMode,
    activeOffsetRef,
    pendingReinitRef,
    onReportResolution,
  });

  useEffect(() => {
    if (activeResolution && onReportResolution) {
      onReportResolution(activeResolution);
    }
  }, [activeResolution, onReportResolution]);

  // ── Subtitles ──────────────────────────────────────────────────────────────

  const {
    activeSubtitleId,
    setActiveSubtitleId,
    activeCues,
    subtitleOffsetSec,
    setSubtitleOffsetSec,
    subtitleFontScale,
    setSubtitleFontScale,
  } = useSubtitles({ mediaInfo, currentTime });

  // ── Video Events ───────────────────────────────────────────────────────────

  const handleEnded = useCallback(() => {
    if (isLocked) return;
    if (roomPlaybackState?.state === 'playing') {
      onPause();
    }
  }, [roomPlaybackState?.state, isLocked, onPause]);

  useVideoEvents({
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
    pendingReinitRef,
    onEnded: handleEnded,
    onAutoplayBlocked: setAutoplayBlocked,
  });

  // ── Controls ───────────────────────────────────────────────────────────────

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
    const currentAbsolute = absolutePlaybackTime(videoRef.current.currentTime, transOffset);
    const newPos = Math.max(0, Math.min(currentAbsolute + offset, mediaInfo?.duration || duration));
    onSeek(newPos);
  }, [mediaInfo?.transcodeOffset, mediaInfo?.duration, duration, onSeek, isLocked]);

  useKeyboardShortcuts({ handlePlayPause, handleSeekOffset });

  usePlayerGestures({
    videoRef,
    containerRef,
    isLocked,
    playbackRate: roomPlaybackState?.playbackRate || 1,
    volume,
    setVolume,
    handlePlayPause,
    onSeek,
    onSetRate,
    idle,
    showControls,
    hideControls,
    lastShowTimeRef,
    mediaDuration: mediaInfo?.duration || duration,
    transcodeOffset: mediaInfo?.transcodeOffset || 0,
  });

  // ── Scrubbing (seek bar drag) ──────────────────────────────────────────────

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
    if (!isDragging) return;

    const handlePointerMove = (e: PointerEvent) => updateDragProgress(e.clientX);

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
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('pointercancel', handlePointerUp);
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointercancel', handlePointerUp);
    };
  }, [isDragging, dragProgress, duration, mediaInfo?.duration, mediaInfo?.transcodeOffset, onSeek]);

  // ── Render ─────────────────────────────────────────────────────────────────

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

  const totalDuration = mediaInfo?.duration || duration;
  const progressPercent = totalDuration > 0 ? (currentTime / totalDuration) * 100 : 0;
  const uiVisible = !idle || !isPlaying || isDragging || settingsMenuOpen;

  useEffect(() => {
    window.dispatchEvent(new CustomEvent('player-controls-toggle', { detail: { visible: uiVisible } }));
  }, [uiVisible]);

  return (
    <div
      ref={containerRef}
      className={`relative w-full h-full bg-ink overflow-hidden text-paper flex flex-col justify-center select-none touch-manipulation`}
      style={{ WebkitTouchCallout: 'none' }}
      onMouseMove={showControls}
    >
      <video
        ref={videoRef}
        playsInline
        className="w-full h-full object-contain bg-ink"
        poster="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='100%25' height='100%25'%3E%3Crect width='100%25' height='100%25' fill='%23000000'/%3E%3C/svg%3E"
        muted={volume === 0}
      />

      {autoplayBlocked && (
        <button
          onClick={() => {
            videoRef.current?.play().then(
              () => setAutoplayBlocked(false),
              () => { /* still blocked — leave the prompt up */ },
            );
          }}
          className="absolute inset-0 z-40 flex items-center justify-center bg-ink/70 text-paper"
        >
          <span className="text-16 uppercase tracking-[0.12em] border border-paper/40 px-6 py-3">
            Tap to play
          </span>
        </button>
      )}

      {/* Floating emoji reactions overlay */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        {floatingEmojis.map(({ id, emoji, username }) => (
          <FloatingEmoji key={id} emoji={emoji} username={username} onComplete={() => removeFloatingEmoji(id)} />
        ))}
      </div>

      {/* Custom subtitle overlay */}
      <SubtitleOverlay activeCues={activeCues} fontScale={subtitleFontScale} />

      <VideoOverlay
        mediaInfo={mediaInfo}
        roomPlaybackState={roomPlaybackState}
        isPlaying={isPlaying}
        isDragging={isDragging}
        isAsyncMode={isAsyncMode}
      />

      {/* Top Bar Container passed as children */}
      <div className={`absolute top-0 left-0 w-full z-50 transition-opacity duration-200 no-gestures ${uiVisible ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
        {typeof children === 'function'
          ? children({
              isSelfLocked,
              onToggleSelfLock: () => setIsSelfLocked((prev) => !prev),
              isServerLocked,
              activeLockByAdmin,
            })
          : children}
      </div>

      <EmojiReactions visible={uiVisible} />

      {/* Bottom Controls */}
      <div
        className={`absolute bottom-0 left-0 w-full z-50 transition-opacity duration-200 bg-gradient-to-t from-ink/90 via-ink/60 to-transparent flex flex-col no-gestures ${uiVisible ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <SeekBar
          ref={progressBarRef}
          isLocked={isLocked}
          bufferedRanges={bufferedRanges}
          progressPercent={progressPercent}
          totalDuration={totalDuration}
          isDragging={isDragging}
          onPointerDown={handlePointerDown}
          formatTime={formatTime}
        />

        <VideoControls
          isLocked={isLocked}
          roomPlaybackState={roomPlaybackState}
          volume={volume}
          setVolume={setVolume}
          currentTime={currentTime}
          totalDuration={totalDuration}
          formatTime={formatTime}
          handlePlayPause={handlePlayPause}
          handleSeekOffset={handleSeekOffset}
          playbackRate={roomPlaybackState?.playbackRate || 1}
          onSetRate={onSetRate}
          levels={levels}
          currentLevel={currentLevel}
          handleQualityChange={handleQualityChange}
          showChat={showChat}
          onToggleChat={onToggleChat}
          isFullscreen={isFullscreen}
          onToggleFullscreen={onToggleFullscreen}
          isAsyncMode={isAsyncMode}
          onToggleAsync={onToggleAsync}
          allowAsyncMode={allowAsyncMode}
          mediaInfo={mediaInfo}
          activeSubtitleId={activeSubtitleId}
          setActiveSubtitleId={setActiveSubtitleId}
          displaySubtitleLabel={displaySubtitleLabel}
          subtitleOffsetSec={subtitleOffsetSec}
          setSubtitleOffsetSec={setSubtitleOffsetSec}
          subtitleFontScale={subtitleFontScale}
          setSubtitleFontScale={setSubtitleFontScale}
          audioTracks={audioTracks}
          currentAudioTrack={currentAudioTrack}
          handleAudioTrackChange={handleAudioTrackChange}
          uiVisible={uiVisible}
          onSettingsMenuChange={setSettingsMenuOpen}
        />
      </div>
    </div>
  );
};
