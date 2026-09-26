import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { SyncStatus } from '@roomies/contracts';
import { VideoPlayerProps, BufferedRange } from './types';
import { absolutePlaybackTime } from '../../lib/hlsOffset';
import { createStore, useStoreValue } from '../../lib/store';
import { useHotkeys } from '../../lib/keyboard';
import { useLayout } from '../../lib/breakpoints';
import { useServices } from '../../app/ServicesProvider';
import { useHlsPlayer } from './hooks/useHlsPlayer';
import { useVideoEvents } from './hooks/useVideoEvents';
import { usePlayerGestures } from './hooks/usePlayerGestures';
import { useControlsVisibility } from './hooks/useControlsVisibility';
import { useScrub } from './hooks/useScrub';
import { useWakeLock } from './hooks/useWakeLock';
import { useSubtitles } from './hooks/useSubtitles';
import { VideoOverlay } from './overlays/VideoOverlay';
import { SubtitleOverlay } from './overlays/SubtitleOverlay';
import { FloatingEmoji } from './overlays/FloatingEmoji';
import { SeekBar } from './controls/SeekBar';
import { VideoControls } from './controls/VideoControls';
import { ReactionColumn } from '../reactions/EmojiReactions';
import { useReactions } from '../reactions/ReactionsContext';
import { usePrefs } from '../settings/PrefsContext';
import { usePresentation } from '../room/PresentationContext';

const SEEK_BATCH_MS = 300;
const NO_SUBTITLES: never[] = [];

export const VideoPlayer: React.FC<VideoPlayerProps> = ({
  mediaInfo,
  seekKey,
  roomPlaybackState,
  localTimeRef,
  localCorrectionRate,
  seekCommand,
  onPlay,
  onPause,
  onSeek,
  onSetRate,
  onStatusChange,
  onReportTime,
  onReportResolution,
  showChat = false,
  onToggleChat,
  isFullscreen = false,
  onToggleFullscreen,
  isAsyncMode = false,
  onToggleAsync,
  allowAsyncMode = true,
  isLockedByAdmin = false,
  onForceResume,
  isPartyJoined = false,
  isMicMuted = true,
  onToggleMic,
  docked,
  children,
}) => {
  const { media } = useServices();
  const { emojiMuted } = usePrefs();
  const { reactions } = useReactions();
  const { setControlsVisible } = usePresentation();
  const isShort = useLayout() === 'short';

  const [timeStore] = useState(() => createStore(0));
  const [isPlaying, setIsPlaying] = useState(false);
  const [volume, setVolume] = useState(1);
  const [duration, setDuration] = useState(0);
  const [bufferedRanges, setBufferedRanges] = useState<BufferedRange[]>([]);
  const [isSelfLocked, setIsSelfLocked] = useState(false);
  const [settingsMenuOpen, setSettingsMenuOpen] = useState(false);
  const [autoplayBlocked, setAutoplayBlocked] = useState(false);
  const [pendingSeek, setPendingSeek] = useState<number | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const activeOffsetRef = useRef(0);
  const pendingReinitRef = useRef(false);
  const pendingSeekRef = useRef<number | null>(null);
  const seekBatchTimerRef = useRef<ReturnType<typeof setTimeout>>();

  const activeLockByAdmin = isLockedByAdmin && !isAsyncMode;
  const isServerLocked = !mediaInfo || activeLockByAdmin;
  const isLocked = isServerLocked || isSelfLocked;
  const totalDuration = mediaInfo?.duration || (duration ? activeOffsetRef.current + duration : 0);

  useEffect(() => {
    if (videoRef.current) videoRef.current.volume = volume;
  }, [volume]);

  const onStatusChangeRef = useRef(onStatusChange);
  useEffect(() => {
    onStatusChangeRef.current = onStatusChange;
  }, [onStatusChange]);

  const lastReportedStatusRef = useRef<SyncStatus>('ready');
  const reportStatus = useCallback((status: SyncStatus, force = false) => {
    if (!force && lastReportedStatusRef.current === status) return;
    lastReportedStatusRef.current = status;
    onStatusChangeRef.current(status);
  }, []);

  useEffect(() => {
    if (mediaInfo) return;
    timeStore.set(0);
    setDuration(0);
    setBufferedRanges([]);
    setIsPlaying(false);
  }, [mediaInfo, timeStore]);

  useEffect(() => {
    setIsSelfLocked(false);
  }, [mediaInfo?.mediaFileId]);

  const { idle, show: showControls, hide: hideControls, onPointerMove } = useControlsVisibility();
  useWakeLock(isPlaying);

  const hls = useHlsPlayer({ videoRef, mediaInfo, seekKey, localTimeRef, activeOffsetRef, pendingReinitRef });

  useEffect(() => {
    if (hls.activeResolution) onReportResolution?.(hls.activeResolution);
  }, [hls.activeResolution, onReportResolution]);

  const subtitles = useSubtitles(mediaInfo);

  const commitSeek = useCallback(
    (time: number) => {
      timeStore.set(time);
      onSeek(time);
    },
    [timeStore, onSeek],
  );

  const scrub = useScrub({ barRef, totalDuration, isLocked, onPreview: timeStore.set, onCommit: commitSeek });

  useVideoEvents({
    videoRef,
    roomPlaybackState,
    localCorrectionRate,
    seekCommand,
    reportStatus,
    isDragging: scrub.isDragging,
    isPlaying,
    setIsPlaying,
    timeStore,
    setDuration,
    setBufferedRanges,
    onReportTime,
    activeOffsetRef,
    pendingReinitRef,
    onAutoplayBlocked: setAutoplayBlocked,
    mediaDuration: mediaInfo?.duration,
  });

  const handlePlayPause = useCallback(() => {
    if (isLocked) return;
    if (roomPlaybackState?.intendedState === 'playing') onPause();
    else onPlay();
  }, [roomPlaybackState?.intendedState, onPlay, onPause, isLocked]);

  useEffect(() => () => clearTimeout(seekBatchTimerRef.current), []);

  const handleSeekOffset = useCallback(
    (offset: number) => {
      if (isLocked || !videoRef.current) return;
      const base = pendingSeekRef.current ?? absolutePlaybackTime(videoRef.current.currentTime, activeOffsetRef.current);
      const target = Math.max(0, Math.min(base + offset, totalDuration));
      pendingSeekRef.current = target;
      setPendingSeek(target);
      clearTimeout(seekBatchTimerRef.current);
      seekBatchTimerRef.current = setTimeout(() => {
        pendingSeekRef.current = null;
        setPendingSeek(null);
        commitSeek(target);
      }, SEEK_BATCH_MS);
    },
    [isLocked, totalDuration, commitSeek],
  );

  useHotkeys({
    ' ': handlePlayPause,
    k: handlePlayPause,
    ArrowLeft: () => handleSeekOffset(-10),
    ArrowRight: () => handleSeekOffset(10),
  });

  usePlayerGestures({
    containerRef,
    isLocked,
    playbackRate: roomPlaybackState?.playbackRate || 1,
    volume,
    setVolume,
    handlePlayPause,
    handleSeekOffset,
    onSetRate,
    holdToSpeed: isAsyncMode,
    canSetVolume: media.canSetVolume,
    idle,
    showControls,
    hideControls,
  });

  const isAtEnd = useStoreValue(timeStore, (time) => totalDuration > 0 && time >= totalDuration - 1);
  const uiVisible = !idle || !isPlaying || scrub.isDragging || settingsMenuOpen;

  useEffect(() => {
    setControlsVisible(uiVisible);
  }, [uiVisible, setControlsVisible]);

  const hlsControls = useMemo(
    () => ({
      levels: hls.levels,
      currentLevel: hls.currentLevel,
      onQualityChange: hls.handleQualityChange,
      audioTracks: hls.audioTracks,
      currentAudioTrack: hls.currentAudioTrack,
      onAudioTrackChange: hls.handleAudioTrackChange,
    }),
    [hls.levels, hls.currentLevel, hls.handleQualityChange, hls.audioTracks, hls.currentAudioTrack, hls.handleAudioTrackChange],
  );

  return (
    <div
      ref={containerRef}
      className="player-container relative w-full h-full bg-ink overflow-hidden text-paper flex flex-col justify-center select-none touch-manipulation"
      style={{ WebkitTouchCallout: 'none' }}
      onPointerMove={onPointerMove}
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
          onClick={() => videoRef.current?.play().then(() => setAutoplayBlocked(false), () => undefined)}
          className="absolute inset-0 z-40 flex items-center justify-center bg-ink/70 text-paper"
        >
          <span className="text-16 uppercase tracking-[0.12em] border border-paper/40 px-6 py-3">Tap to play</span>
        </button>
      )}

      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        {!emojiMuted && reactions.map((r) => <FloatingEmoji key={r.id} emoji={r.emoji} username={r.username} compact={docked || isShort} />)}
      </div>

      <SubtitleOverlay
        cues={subtitles.cues}
        offset={subtitles.subtitleOffsetSec}
        fontScale={subtitles.subtitleFontScale}
        timeStore={timeStore}
      />

      <VideoOverlay
        mediaInfo={mediaInfo}
        roomPlaybackState={roomPlaybackState}
        isPlaying={isPlaying}
        isDragging={scrub.isDragging}
        isAsyncMode={isAsyncMode}
        isAtEnd={isAtEnd}
        onForceResume={onForceResume}
        errorText={hls.playbackError}
      />

      <div className={`absolute top-0 left-0 w-full z-50 transition-opacity duration-200 no-gestures safe-x safe-t ${uiVisible ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
        {typeof children === 'function'
          ? children({ isSelfLocked, onToggleSelfLock: () => setIsSelfLocked((prev) => !prev), isServerLocked, activeLockByAdmin })
          : children}
      </div>

      {!docked && <ReactionColumn visible={uiVisible} short={isShort} />}

      <div
        className={`absolute bottom-0 left-0 w-full z-50 transition-opacity duration-200 bg-linear-to-t from-ink/90 via-ink/60 to-transparent flex flex-col no-gestures safe-x safe-b ${uiVisible ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
      >
        <SeekBar
          barRef={barRef}
          timeStore={timeStore}
          pendingSeek={pendingSeek}
          totalDuration={totalDuration}
          bufferedRanges={bufferedRanges}
          isLocked={isLocked}
          isDragging={scrub.isDragging}
          onPointerDown={scrub.onPointerDown}
        />

        <VideoControls
          hasMedia={Boolean(mediaInfo?.hlsUrl)}
          isLocked={isLocked}
          isPlaying={roomPlaybackState?.intendedState === 'playing'}
          volume={volume}
          setVolume={setVolume}
          timeStore={timeStore}
          pendingSeek={pendingSeek}
          totalDuration={totalDuration}
          onPlayPause={handlePlayPause}
          onSeekOffset={handleSeekOffset}
          playbackRate={roomPlaybackState?.playbackRate || 1}
          onSetRate={onSetRate}
          hls={hlsControls}
          subtitles={mediaInfo?.subtitles ?? NO_SUBTITLES}
          subs={subtitles}
          showChat={showChat}
          onToggleChat={onToggleChat}
          isFullscreen={isFullscreen}
          onToggleFullscreen={onToggleFullscreen}
          isAsyncMode={isAsyncMode}
          onToggleAsync={onToggleAsync}
          allowAsyncMode={allowAsyncMode}
          onMenuOpenChange={setSettingsMenuOpen}
          isPartyJoined={isPartyJoined}
          isMicMuted={isMicMuted}
          onToggleMic={onToggleMic}
          docked={docked}
        />
      </div>
    </div>
  );
};
