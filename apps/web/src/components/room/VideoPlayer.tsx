import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Play, Pause, RotateCcw, RotateCw, Volume2, VolumeX, Maximize, MessageSquare } from 'lucide-react';
import Hls, { Level } from 'hls.js';
import { IconButton } from '../ui/IconButton';
import { MediaInfo, RoomState } from '../../hooks/useRoomSync';

export interface VideoPlayerProps {
  mediaInfo: MediaInfo | null;
  seekKey?: number;
  roomPlaybackState?: RoomState['playback'];
  localTime: number;
  localCorrectionRate?: number | null;
  syncSeekTrigger?: number;
  syncSeekPosition?: number;
  onPlay: () => void;
  onPause: () => void;
  onSeek: (position: number) => void;
  onSetRate: (rate: number) => void;
  onStatusChange: (status: 'ready' | 'buffering') => void;
  showChat?: boolean;
  onToggleChat?: () => void;
  children?: React.ReactNode;
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

export function VideoPlayer({
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
  showChat,
  onToggleChat,
  children
}: VideoPlayerProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [idle, setIdle] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  const isLocked = !mediaInfo || roomPlaybackState?.state === 'waiting';

  const overlayTextRef = useRef(!mediaInfo ? 'THE PARTY WILL START SOON' : 'PAUSED');
  if (!mediaInfo) {
    overlayTextRef.current = 'THE PARTY WILL START SOON';
  } else if (roomPlaybackState?.state === 'buffering') {
    overlayTextRef.current = 'SYNCING';
  } else if (roomPlaybackState?.state === 'paused' || roomPlaybackState?.state === 'waiting') {
    overlayTextRef.current = 'PAUSED';
  }

  const [levels, setLevels] = useState<Level[]>([]);
  const [currentLevel, setCurrentLevel] = useState<number>(-1);
  const [showQualityMenu, setShowQualityMenu] = useState(false);

  const [bufferedRanges, setBufferedRanges] = useState<{ start: number, end: number }[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [dragProgress, setDragProgress] = useState(0);

  const timerRef = useRef<ReturnType<typeof setTimeout>>();
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const progressBarRef = useRef<HTMLDivElement>(null);
  const lastProcessedTriggerRef = useRef(0);

  useEffect(() => {
    if (!mediaInfo) {
      setCurrentTime(0);
      setDuration(0);
      setBufferedRanges([]);
      setIsPlaying(false);
      setDragProgress(0);
      setLevels([]);
      setCurrentLevel(-1);
    }
  }, [mediaInfo]);

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

  // NOTE: Setup HLS (rebuilds when media URL or seekKey changes).
  useEffect(() => {
    if (!videoRef.current) return;

    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }
    videoRef.current.removeAttribute('src');
    videoRef.current.load();

    if (!mediaInfo?.hlsUrl) return;

    reportStatus('buffering');
    setLevels([]);
    setCurrentLevel(-1);

    if (Hls.isSupported()) {
      const hls = new Hls({
        startPosition: localTime > 0 ? Math.max(0, localTime - (mediaInfo?.transcodeOffset || 0)) : undefined,
        enableWorker: true,
        lowLatencyMode: false,
        manifestLoadingMaxRetry: 10,
        manifestLoadingRetryDelay: 1000,
        levelLoadingMaxRetry: 10,
        levelLoadingRetryDelay: 1000,
        fragLoadingMaxRetry: 10,
        fragLoadingRetryDelay: 1000,
        maxBufferLength: 60,
        maxMaxBufferLength: 120,
      });

      hls.loadSource(`${mediaInfo.hlsUrl}?t=${Date.now()}`);
      hls.attachMedia(videoRef.current);

      hls.on(Hls.Events.MANIFEST_PARSED, (_event, data) => {
        setLevels(data.levels);
        if (roomPlaybackState?.state === 'playing') {
          videoRef.current?.play().catch(err => console.error('[playback] Play failed:', err));
          setIsPlaying(true);
        }
      });

      hls.on(Hls.Events.LEVEL_SWITCHED, () => {
        setCurrentLevel(hls.autoLevelEnabled ? -1 : hls.currentLevel);
      });

      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (data.fatal) {
          console.error('[playback] HLS fatal error:', data.type, data.details);
          if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
            hls.startLoad(videoRef.current?.currentTime ?? -1);
          } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
            hls.recoverMediaError();
          }
        }
      });

      hlsRef.current = hls;

      return () => {
        hls.destroy();
        hlsRef.current = null;
      };
    } else if (videoRef.current.canPlayType('application/vnd.apple.mpegurl')) {
      videoRef.current.src = mediaInfo.hlsUrl;
      videoRef.current.currentTime = Math.max(0, localTime - (mediaInfo?.transcodeOffset || 0));
      videoRef.current.addEventListener('loadedmetadata', () => {
        reportStatus('ready');
      }, { once: true });
    }
  }, [mediaInfo?.hlsUrl, seekKey, reportStatus]);

  useEffect(() => {
    if (!videoRef.current) return;
    if (roomPlaybackState?.state === 'playing' && !isPlaying && !isDragging) {
      videoRef.current.play().catch(err => console.error('[playback] Play failed:', err));
      setIsPlaying(true);
    } else if (roomPlaybackState?.state !== 'playing' && isPlaying) {
      videoRef.current.pause();
      setIsPlaying(false);
    }
  }, [roomPlaybackState?.state, isDragging]);

  // NOTE: Apply playback rate, favoring local temporary correction over global rate.
  useEffect(() => {
    if (videoRef.current) {
      const targetRate = localCorrectionRate ?? roomPlaybackState?.playbackRate ?? 1;
      if (videoRef.current.playbackRate !== targetRate) {
        videoRef.current.playbackRate = targetRate;
      }
    }
  }, [roomPlaybackState?.playbackRate, localCorrectionRate]);

  // NOTE: Sync playback position (triggered explicitly by the sync engine).
  useEffect(() => {
    if (syncSeekTrigger <= lastProcessedTriggerRef.current) return;

    if (isDragging) {
      lastProcessedTriggerRef.current = syncSeekTrigger;
      return;
    }

    if (!videoRef.current || syncSeekTrigger === 0) return;
    
    lastProcessedTriggerRef.current = syncSeekTrigger;

    const transOffset = mediaInfo?.transcodeOffset || 0;
    console.log(`[playback] Executing sync seek to absolute ${syncSeekPosition} (relative: ${syncSeekPosition - transOffset})`);
    
    // NOTE: Reset status to buffering because seek triggers client/room buffering.
    lastReportedStatusRef.current = 'buffering';
    
    videoRef.current.currentTime = Math.max(0, syncSeekPosition - transOffset);
    setCurrentTime(syncSeekPosition);
  }, [syncSeekTrigger, syncSeekPosition, isDragging, mediaInfo?.transcodeOffset]);

  useEffect(() => {
    const resetIdleTimer = () => {
      setIdle(false);
      clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        setIdle(true);
      }, 3000);
    };

    window.addEventListener('mousemove', resetIdleTimer);
    window.addEventListener('keydown', resetIdleTimer);
    resetIdleTimer();

    return () => {
      window.removeEventListener('mousemove', resetIdleTimer);
      window.removeEventListener('keydown', resetIdleTimer);
      clearTimeout(timerRef.current);
    };
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    let bufferingTimeout: ReturnType<typeof setTimeout>;

    const handleWaiting = () => {
      // NOTE: Debounce waiting event to prevent segment switches from pausing the room.
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
      const transOffset = mediaInfo?.transcodeOffset || 0;
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
      const transOffset = mediaInfo?.transcodeOffset || 0;
      if (!isDragging) {
        setCurrentTime(video.currentTime + transOffset);
      }
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
  }, [isDragging, mediaInfo?.transcodeOffset]);

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

  // Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if typing in input/textarea (like chat)
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      switch (e.key) {
        case ' ':
        case 'k':
        case 'K':
          e.preventDefault();
          handlePlayPause();
          break;
        case 'ArrowLeft':
          e.preventDefault();
          handleSeekOffset(-10);
          break;
        case 'ArrowRight':
          e.preventDefault();
          handleSeekOffset(10);
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handlePlayPause, handleSeekOffset]);

  const handleQualityChange = (index: number) => {
    if (hlsRef.current) {
      hlsRef.current.currentLevel = index;
      setCurrentLevel(index);
      setShowQualityMenu(false);
    }
  };

  const cyclePlaybackRate = () => {
    if (isLocked) return;
    const rates = [0.5, 1, 1.25, 1.5, 2];
    const currentRate = roomPlaybackState?.playbackRate || 1;
    const next = rates[(rates.indexOf(currentRate) + 1) % rates.length];
    onSetRate(next);
  };

  const totalDuration = mediaInfo?.duration || duration;
  const progressPercent = totalDuration > 0 ? (currentTime / totalDuration) * 100 : 0;

  const uiVisible = !idle || !isPlaying || isDragging;

  return (
    <div className="relative w-full h-full bg-ink overflow-hidden text-paper flex flex-col justify-center">
      <video
        ref={videoRef}
        className="w-full h-full object-contain bg-ink"
        poster="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='100%25' height='100%25'%3E%3Crect width='100%25' height='100%25' fill='%23000000'/%3E%3C/svg%3E"
        muted={isMuted}
      />

      {/* Smooth Fade Overlay for Paused/Syncing */}
      <div 
        className={`absolute inset-0 bg-ink/60 z-20 flex items-center justify-center pointer-events-none transition-opacity duration-300 ${
          (roomPlaybackState?.state === 'buffering' || (!isPlaying && !isDragging)) ? 'opacity-100' : 'opacity-0'
        }`}
      >
        <h2 className={`text-28 font-medium tracking-[0.12em] text-paper/80 animate-pulse drop-shadow-lg text-center px-6 ${mediaInfo ? 'uppercase' : ''}`}>
          {overlayTextRef.current}
        </h2>
      </div>

      {/* Top Bar Container passed as children */}
      <div className={`absolute top-0 left-0 w-full z-50 transition-opacity duration-200 ${uiVisible ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
        {children}
      </div>

      {/* Bottom Controls */}
      <div className={`absolute bottom-0 left-0 w-full z-50 transition-opacity duration-200 bg-linear-to-t from-ink/90 via-ink/60 to-transparent flex flex-col ${uiVisible ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>

        {/* Seek Bar */}
        <div className={`w-full py-2 px-2 relative ${isLocked ? 'cursor-not-allowed opacity-50' : 'cursor-pointer group'}`} onPointerDown={isLocked ? undefined : handlePointerDown}>
          <div ref={progressBarRef} className="w-full h-[4px] group-hover:h-[6px] transition-all duration-100 bg-ash/30 relative flex items-center rounded-full overflow-hidden group-hover:overflow-visible">

            {/* Buffered Ranges */}
            {bufferedRanges.map((range, i) => (
              <div
                key={i}
                className="h-full bg-paper/30 absolute top-0"
                style={{
                  left: `${totalDuration > 0 ? (range.start / totalDuration) * 100 : 0}%`,
                  width: `${totalDuration > 0 ? ((range.end - range.start) / totalDuration) * 100 : 0}%`
                }}
              />
            ))}

            {/* Played Progress */}
            <div className="h-full bg-blue-500 absolute top-0 left-0 shadow-[0_0_8px_rgba(59,130,246,0.8)]" style={{ width: `${progressPercent}%` }} />

            {/* Scrubber handle */}
            <div className={`w-[14px] h-[14px] bg-white rounded-full absolute ml-[-7px] shadow transition-transform ${isDragging ? 'scale-100' : 'scale-0 group-hover:scale-100'}`} style={{ left: `${progressPercent}%` }} />
          </div>
        </div>

        {/* Control Row */}
        <div className="flex items-center justify-between px-4 pb-3 pt-1">
          <div className="flex items-center gap-4">
            <IconButton disabled={isLocked} icon={roomPlaybackState?.state === 'playing' ? <Pause size={20} fill="currentColor" /> : <Play size={20} fill="currentColor" />} onClick={handlePlayPause} />
            <div className="flex items-center gap-2">
              <IconButton disabled={isLocked} icon={<RotateCcw size={18} strokeWidth={1.5} />} onClick={() => handleSeekOffset(-10)} />
              <IconButton disabled={isLocked} icon={<RotateCw size={18} strokeWidth={1.5} />} onClick={() => handleSeekOffset(10)} />
            </div>
            <div className="flex items-center group relative">
              <IconButton icon={isMuted ? <VolumeX size={18} strokeWidth={1.5} /> : <Volume2 size={18} strokeWidth={1.5} />} onClick={() => setIsMuted(!isMuted)} />
            </div>
            <div className="font-mono text-14 text-paper ml-2 opacity-80">
              {formatTime(currentTime)} / {formatTime(totalDuration)}
            </div>
          </div>

          <div className="flex items-center gap-4 relative">
            <button disabled={isLocked} onClick={cyclePlaybackRate} className="text-14 font-mono text-paper hover:text-fog transition-colors w-8 text-center opacity-80 hover:opacity-100 disabled:opacity-30 disabled:cursor-not-allowed">
              {roomPlaybackState?.playbackRate || 1}x
            </button>

            {/* Quality Selector */}
            {levels.length > 0 && (
              <div className="relative">
                <button
                  onClick={() => setShowQualityMenu(!showQualityMenu)}
                  className={`text-14 font-mono transition-colors w-12 text-center ${currentLevel !== -1 ? 'text-blue-400 font-medium' : 'text-paper/80 hover:text-paper'}`}
                >
                  {currentLevel === -1 ? 'AUTO' : `${levels[currentLevel]?.height}p`}
                </button>

                {showQualityMenu && (
                  <div className="absolute bottom-full right-0 mb-4 bg-ink/95 backdrop-blur-md border border-ash/20 rounded-lg shadow-2xl py-2 min-w-[120px] overflow-hidden">
                    <div className="px-4 py-2 text-[10px] text-paper/50 uppercase tracking-widest font-semibold border-b border-ash/10 mb-1">Quality</div>
                    <button
                      onClick={() => handleQualityChange(-1)}
                      className={`w-full text-left px-4 py-2 text-13 transition-colors ${currentLevel === -1 ? 'bg-blue-500/10 text-blue-400 font-medium' : 'text-paper hover:bg-ash/20'}`}
                    >
                      Auto
                    </button>
                    {[...levels].reverse().map((level) => {
                      const originalIndex = levels.indexOf(level);
                      return (
                        <button
                          key={originalIndex}
                          onClick={() => handleQualityChange(originalIndex)}
                          className={`w-full text-left px-4 py-2 text-13 transition-colors ${currentLevel === originalIndex ? 'bg-blue-500/10 text-blue-400 font-medium' : 'text-paper hover:bg-ash/20'}`}
                        >
                          {level.height}p
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {onToggleChat && (
              <IconButton
                icon={<MessageSquare size={18} strokeWidth={1.5} />}
                onClick={onToggleChat}
                active={showChat}
              />
            )}

            <IconButton icon={<Maximize size={18} strokeWidth={1.5} />} onClick={() => {
              if (document.fullscreenElement) {
                document.exitFullscreen();
              } else {
                document.documentElement.requestFullscreen();
              }
            }} />
          </div>
        </div>
      </div>
    </div>
  );
}
