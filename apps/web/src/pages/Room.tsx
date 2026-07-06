import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, Play, Pause, RotateCcw, RotateCw, Volume2, VolumeX, Maximize, Settings2 } from 'lucide-react';
import Hls from 'hls.js';
import { IconButton } from '../components/ui/IconButton';
import { AdminOverlay } from '../components/room/AdminOverlay';
import { useRoomSync } from '../hooks/useRoomSync';

export default function Room() {
  const navigate = useNavigate();
  const [viewersCount, setViewersCount] = useState<number>(0);

  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [showAdmin, setShowAdmin] = useState(false);
  const [idle, setIdle] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  const timerRef = useRef<ReturnType<typeof setTimeout>>();
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);

  const {
    roomState,
    mediaInfo,
    localTime,
    play,
    pause,
    seek,
    ready,
    notReady,
    buffering,
    buffered,
  } = useRoomSync();

  useEffect(() => { 
    if (roomState?.members) {
      setViewersCount(roomState.members.length);
    }
  }, [roomState?.members]);

  // Setup HLS — rebuild when media changes
  useEffect(() => {
    if (!videoRef.current || !mediaInfo?.hlsUrl) return;

    // Tear down any existing HLS instance
    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }

    // Signal that we're not ready yet (new media loading)
    notReady();

    if (Hls.isSupported()) {
      const hls = new Hls({
        enableWorker: true,
        lowLatencyMode: false,
        // Retry aggressively — segments appear as FFmpeg writes them
        manifestLoadingMaxRetry: 10,
        manifestLoadingRetryDelay: 1000,
        levelLoadingMaxRetry: 10,
        levelLoadingRetryDelay: 1000,
        fragLoadingMaxRetry: 10,
        fragLoadingRetryDelay: 1000,
      });

      hls.loadSource(mediaInfo.hlsUrl);
      hls.attachMedia(videoRef.current);

      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        // Manifest loaded — signal ready
        ready();
        if (roomState?.playback.state === 'playing') {
          videoRef.current?.play().catch(console.error);
          setIsPlaying(true);
        }
      });

      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (data.fatal) {
          console.error('[HLS] Fatal error:', data.type, data.details);
          // Try to recover
          if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
            hls.startLoad();
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
      // Safari native HLS
      videoRef.current.src = mediaInfo.hlsUrl;
      videoRef.current.addEventListener('loadedmetadata', () => {
        ready();
      }, { once: true });
    }
  }, [mediaInfo?.hlsUrl]);

  // Sync playback state from server
  useEffect(() => {
    if (!videoRef.current) return;
    if (roomState?.playback.state === 'playing' && !isPlaying) {
      videoRef.current.play().catch(console.error);
      setIsPlaying(true);
    } else if (roomState?.playback.state !== 'playing' && isPlaying) {
      videoRef.current.pause();
      setIsPlaying(false);
    }
  }, [roomState?.playback.state]);

  // Apply drift correction (if server localTime differs significantly from video.currentTime)
  useEffect(() => {
    if (!videoRef.current) return;
    const diff = Math.abs(videoRef.current.currentTime - localTime);
    // If diff is greater than 1s, we force a seek to localTime
    if (diff > 1) {
      videoRef.current.currentTime = localTime;
    }
  }, [localTime]);

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

  // Time Updates
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const onTimeUpdate = () => {
      setCurrentTime(video.currentTime);
      setDuration(video.duration || 0);
    };

    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);
    const onWaiting = () => buffering();
    const onPlaying = () => buffered();

    video.addEventListener('timeupdate', onTimeUpdate);
    video.addEventListener('play', onPlay);
    video.addEventListener('pause', onPause);
    video.addEventListener('waiting', onWaiting);
    video.addEventListener('playing', onPlaying);
    
    return () => {
      video.removeEventListener('timeupdate', onTimeUpdate);
      video.removeEventListener('play', onPlay);
      video.removeEventListener('pause', onPause);
      video.removeEventListener('waiting', onWaiting);
      video.removeEventListener('playing', onPlaying);
    };
  }, [buffering, buffered]);

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
    if (isPlaying) {
      pause();
      videoRef.current?.pause();
    } else {
      play();
      videoRef.current?.play().catch(console.error);
    }
  };

  const handleSeekOffset = (offset: number) => {
    if (!videoRef.current) return;
    const newPos = Math.max(0, videoRef.current.currentTime + offset);
    seek(newPos);
    videoRef.current.currentTime = newPos;
  };

  const handleSeekTo = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!videoRef.current || !duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const pos = (e.clientX - rect.left) / rect.width;
    const newPos = pos * duration;
    seek(newPos);
    videoRef.current.currentTime = newPos;
  };

  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div className="relative w-full h-screen bg-ink overflow-hidden text-paper">
      <video
        ref={videoRef}
        className="w-full h-full object-contain bg-ink"
        poster="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='100%25' height='100%25'%3E%3Crect width='100%25' height='100%25' fill='%23000000'/%3E%3C/svg%3E"
        muted={isMuted}
      />

      {!isPlaying && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-20">
          <h2 className="text-28 font-medium uppercase tracking-[0.12em] text-paper/80 animate-pulse">
            {mediaInfo ? 'HANG TIGHT!' : 'NO MEDIA SELECTED'}
          </h2>
        </div>
      )}

      {/* Top Bar */}
      <div className={`absolute top-0 left-0 w-full z-30 transition-opacity duration-200 ${idle && isPlaying ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}>
        <div className="flex justify-between items-center px-4 py-3 bg-gradient-to-b from-ink/80 to-transparent">
          <button onClick={() => navigate('/')} className="flex items-center text-14 uppercase tracking-[0.08em] hover:text-fog transition-colors">
            <ChevronLeft size={16} className="mr-1" /> Exit
          </button>
          
          <div className="text-14 uppercase tracking-[0.08em] flex items-center gap-2">
            {mediaInfo?.title || 'ROOM'} · <span className="font-mono text-14">{viewersCount}</span> WATCHING
          </div>
          
          <button onClick={() => setShowAdmin(true)} className="flex items-center text-14 uppercase tracking-[0.08em] hover:text-fog transition-colors">
            Manage <Settings2 size={16} className="ml-1" />
          </button>
        </div>
      </div>

      {/* Bottom Controls */}
      <div className={`absolute bottom-0 left-0 w-full z-30 transition-opacity duration-200 bg-gradient-to-t from-ink/90 to-transparent flex flex-col ${idle && isPlaying ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}>
        
        {/* Seek Bar */}
        <div className="w-full h-[2px] bg-ash cursor-pointer relative group" onClick={handleSeekTo}>
          <div className="h-full bg-paper absolute top-0 left-0 transition-all duration-100" style={{ width: `${progressPercent}%` }} />
          <div className="w-[1px] h-[8px] bg-paper absolute top-1/2 -translate-y-1/2 hidden group-hover:block transition-all duration-100" style={{ left: `${progressPercent}%` }} />
        </div>

        {/* Control Row */}
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-4">
            <IconButton icon={isPlaying ? <Pause size={20} fill="currentColor" /> : <Play size={20} fill="currentColor" />} onClick={handlePlayPause} />
            <div className="flex items-center gap-2">
              <IconButton icon={<RotateCcw size={18} strokeWidth={1.5} />} onClick={() => handleSeekOffset(-10)} />
              <IconButton icon={<RotateCw size={18} strokeWidth={1.5} />} onClick={() => handleSeekOffset(10)} />
            </div>
            <div className="flex items-center group relative">
              <IconButton icon={isMuted ? <VolumeX size={18} strokeWidth={1.5} /> : <Volume2 size={18} strokeWidth={1.5} />} onClick={() => setIsMuted(!isMuted)} />
            </div>
            <div className="font-mono text-14 text-paper ml-2">
              {formatTime(currentTime)} / {formatTime(duration)}
            </div>
          </div>
          
          <div className="flex items-center gap-4">
            <button className="text-14 font-mono text-paper hover:text-fog transition-colors">1x</button>
            <button className="text-14 uppercase tracking-[0.08em] font-medium text-paper hover:text-fog transition-colors">CC</button>
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

      <AdminOverlay isOpen={showAdmin} onClose={() => setShowAdmin(false)} />
    </div>
  );
}
