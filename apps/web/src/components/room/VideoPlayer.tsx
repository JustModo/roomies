import React, { useState, useEffect, useRef } from 'react';
import { Play, Pause, RotateCcw, RotateCw, Volume2, VolumeX, Maximize } from 'lucide-react';
import Hls, { Level } from 'hls.js';
import { IconButton } from '../ui/IconButton';
import { MediaInfo, RoomState } from '../../hooks/useRoomSync';

export interface VideoPlayerProps {
  mediaInfo: MediaInfo | null;
  seekKey?: number;
  roomPlaybackState?: RoomState['playback'];
  localTime: number;
  localCorrectionRate?: number | null;
  onPlay: () => void;
  onPause: () => void;
  onSeek: (position: number) => void;
  onSetRate: (rate: number) => void;
  onStatusChange: (status: 'ready' | 'buffering') => void;
  children?: React.ReactNode; // Used for inserting top bar UI over the player
}

export function VideoPlayer({
  mediaInfo,
  seekKey,
  roomPlaybackState,
  localTime,
  localCorrectionRate,
  onPlay,
  onPause,
  onSeek,
  onSetRate,
  onStatusChange,
  children
}: VideoPlayerProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [idle, setIdle] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  // Quality / Codec Selection
  const [levels, setLevels] = useState<Level[]>([]);
  const [currentLevel, setCurrentLevel] = useState<number>(-1);
  const [showQualityMenu, setShowQualityMenu] = useState(false);

  // Seek Bar / Scrubbing
  const [bufferedRanges, setBufferedRanges] = useState<{ start: number, end: number }[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [dragProgress, setDragProgress] = useState(0);

  const timerRef = useRef<ReturnType<typeof setTimeout>>();
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const progressBarRef = useRef<HTMLDivElement>(null);

  // Stable ref for status callbacks to prevent listener thrash
  const onStatusChangeRef = useRef(onStatusChange);
  useEffect(() => {
    onStatusChangeRef.current = onStatusChange;
  }, [onStatusChange]);

  // Setup HLS — rebuild when media URL or seekKey changes
  useEffect(() => {
    if (!videoRef.current || !mediaInfo?.hlsUrl) return;

    if (hlsRef.current) {
      // If we already have an HLS instance and just the URL/seekKey updated
      // but it's the exact same media (e.g. after a seek), do a soft reload
      // from the new position instead of a full teardown.
      const currentUrl = hlsRef.current.url;
      if (currentUrl === mediaInfo.hlsUrl) {
        hlsRef.current.stopLoad();
        hlsRef.current.startLoad(localTime);
        return;
      }

      hlsRef.current.destroy();
      hlsRef.current = null;
    }

    onStatusChangeRef.current('buffering');
    setLevels([]);
    setCurrentLevel(-1);

    if (Hls.isSupported()) {
      const hls = new Hls({
        startPosition: localTime > 0 ? localTime : undefined,
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

      hls.loadSource(mediaInfo.hlsUrl);
      hls.attachMedia(videoRef.current);

      hls.on(Hls.Events.MANIFEST_PARSED, (_event, data) => {
        setLevels(data.levels);
        if (roomPlaybackState?.state === 'playing') {
          videoRef.current?.play().catch(console.error);
          setIsPlaying(true);
        }
      });

      hls.on(Hls.Events.LEVEL_SWITCHED, () => {
        setCurrentLevel(hls.autoLevelEnabled ? -1 : hls.currentLevel);
      });

      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (data.fatal) {
          console.error('[HLS] Fatal error:', data.type, data.details);
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
      videoRef.current.currentTime = localTime;
      videoRef.current.addEventListener('loadedmetadata', () => {
        onStatusChangeRef.current('ready');
      }, { once: true });
    }
  }, [mediaInfo?.hlsUrl, seekKey]);

  // Sync playback state from server
  useEffect(() => {
    if (!videoRef.current) return;
    if (roomPlaybackState?.state === 'playing' && !isPlaying && !isDragging) {
      videoRef.current.play().catch(console.error);
      setIsPlaying(true);
    } else if (roomPlaybackState?.state !== 'playing' && isPlaying) {
      videoRef.current.pause();
      setIsPlaying(false);
    }
  }, [roomPlaybackState?.state, isDragging]);

  // Apply playback rate (favor local temporary correction over global rate)
  useEffect(() => {
    if (videoRef.current) {
      const targetRate = localCorrectionRate ?? roomPlaybackState?.playbackRate ?? 1;
      if (videoRef.current.playbackRate !== targetRate) {
        videoRef.current.playbackRate = targetRate;
      }
    }
  }, [roomPlaybackState?.playbackRate, localCorrectionRate]);

  // Apply drift correction (if server localTime differs significantly from video.currentTime)
  useEffect(() => {
    if (!videoRef.current || isDragging) return;
    const diff = Math.abs(videoRef.current.currentTime - localTime);
    if (diff > 3) {
      videoRef.current.currentTime = localTime;
    }
  }, [localTime, isDragging]);

  // Idle Timer
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

  // Status update event listeners (Stable, no dragging dependencies)
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    let bufferingTimeout: ReturnType<typeof setTimeout>;

    const handleWaiting = () => {
      // Debounce the 'waiting' event so minor 100ms internal decoder 
      // stalls during segment switches don't pause the whole room
      clearTimeout(bufferingTimeout);
      bufferingTimeout = setTimeout(() => {
        onStatusChangeRef.current('buffering');
      }, 1500);
    };

    const handleReady = () => {
      clearTimeout(bufferingTimeout);
      onStatusChangeRef.current('ready');
    };

    video.addEventListener('waiting', handleWaiting);
    video.addEventListener('playing', handleReady);
    video.addEventListener('canplay', handleReady);

    return () => {
      clearTimeout(bufferingTimeout);
      video.removeEventListener('waiting', handleWaiting);
      video.removeEventListener('playing', handleReady);
      video.removeEventListener('canplay', handleReady);
    };
  }, []);

  // Time and Progress Updates
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const onTimeUpdate = () => {
      if (!isDragging) {
        setCurrentTime(video.currentTime);
      }
      setDuration(video.duration || 0);
    };

    const onProgress = () => {
      const ranges = [];
      for (let i = 0; i < video.buffered.length; i++) {
        ranges.push({ start: video.buffered.start(i), end: video.buffered.end(i) });
      }
      setBufferedRanges(ranges);
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
  }, [isDragging]);

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
      const handlePointerUp = () => {
        setIsDragging(false);
        const totalDuration = mediaInfo?.duration || duration;
        const newPos = dragProgress * totalDuration;
        onSeek(newPos);
        if (videoRef.current) videoRef.current.currentTime = newPos;
        if (roomPlaybackState?.state === 'playing') onPlay();
      };

      window.addEventListener('pointermove', handlePointerMove);
      window.addEventListener('pointerup', handlePointerUp);
      return () => {
        window.removeEventListener('pointermove', handlePointerMove);
        window.removeEventListener('pointerup', handlePointerUp);
      };
    }
  }, [isDragging, dragProgress, duration, mediaInfo?.duration, onSeek, onPlay, roomPlaybackState?.state]);

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

  const handlePlayPause = () => {
    if (roomPlaybackState?.state === 'playing') {
      onPause();
    } else {
      onPlay();
    }
  };

  const handleSeekOffset = (offset: number) => {
    if (!videoRef.current) return;
    const newPos = Math.max(0, videoRef.current.currentTime + offset);
    videoRef.current.currentTime = newPos;
    onSeek(newPos);
  };

  const handleQualityChange = (index: number) => {
    if (hlsRef.current) {
      hlsRef.current.currentLevel = index;
      setCurrentLevel(index);
      setShowQualityMenu(false);
    }
  };

  const cyclePlaybackRate = () => {
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

      {!isPlaying && !isDragging && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-20">
          <h2 className="text-28 font-medium uppercase tracking-[0.12em] text-paper/80 animate-pulse drop-shadow-lg">
            {mediaInfo ? 'PAUSED' : 'NO MEDIA SELECTED'}
          </h2>
        </div>
      )}

      {/* Top Bar Container passed as children */}
      <div className={`absolute top-0 left-0 w-full z-30 transition-opacity duration-200 ${uiVisible ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
        {children}
      </div>

      {/* Bottom Controls */}
      <div className={`absolute bottom-0 left-0 w-full z-30 transition-opacity duration-200 bg-gradient-to-t from-ink/90 via-ink/60 to-transparent flex flex-col ${uiVisible ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>

        {/* Seek Bar */}
        <div className="w-full py-2 px-2 cursor-pointer group" onPointerDown={handlePointerDown}>
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
            <div className={`w-[14px] h-[14px] bg-white rounded-full absolute -ml-[7px] shadow transition-transform ${isDragging ? 'scale-100' : 'scale-0 group-hover:scale-100'}`} style={{ left: `${progressPercent}%` }} />
          </div>
        </div>

        {/* Control Row */}
        <div className="flex items-center justify-between px-4 pb-3 pt-1">
          <div className="flex items-center gap-4">
            <IconButton icon={roomPlaybackState?.state === 'playing' ? <Pause size={20} fill="currentColor" /> : <Play size={20} fill="currentColor" />} onClick={handlePlayPause} />
            <div className="flex items-center gap-2">
              <IconButton icon={<RotateCcw size={18} strokeWidth={1.5} />} onClick={() => handleSeekOffset(-10)} />
              <IconButton icon={<RotateCw size={18} strokeWidth={1.5} />} onClick={() => handleSeekOffset(10)} />
            </div>
            <div className="flex items-center group relative">
              <IconButton icon={isMuted ? <VolumeX size={18} strokeWidth={1.5} /> : <Volume2 size={18} strokeWidth={1.5} />} onClick={() => setIsMuted(!isMuted)} />
            </div>
            <div className="font-mono text-14 text-paper ml-2 opacity-80">
              {formatTime(currentTime)} / {formatTime(totalDuration)}
            </div>
          </div>

          <div className="flex items-center gap-4 relative">
            <button onClick={cyclePlaybackRate} className="text-14 font-mono text-paper hover:text-fog transition-colors w-[3ch] text-center opacity-80 hover:opacity-100">
              {roomPlaybackState?.playbackRate || 1}x
            </button>

            {/* Quality Selector */}
            {levels.length > 0 && (
              <div className="relative">
                <button
                  onClick={() => setShowQualityMenu(!showQualityMenu)}
                  className={`text-14 font-mono transition-colors ${currentLevel !== -1 ? 'text-blue-400 font-medium' : 'text-paper/80 hover:text-paper'}`}
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
