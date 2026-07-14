import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, Settings2 } from 'lucide-react';
import { AdminOverlay } from '../components/AdminOverlay';
import { useRoomSync, RoomState, MediaInfo } from '../hooks/useRoomSync';
import { useAuth } from '../contexts/AuthContext';
import { ChatProvider, useChat } from '../contexts/ChatContext';
import { ChatSidebar, ChatToasts } from '../components/Chat';
import { VideoPlayer } from '../components/VideoPlayer';

/**
 * Tracks window.visualViewport height so the layout correctly shrinks when
 * the software keyboard opens, and stays stable when the browser URL bar
 * shows / hides on scroll.
 *
 * Returns a CSS height value (e.g. "667px" or "100dvh" fallback).
 */
function useVisualViewportHeight(): string {
  const [height, setHeight] = useState<string>('100dvh');

  useEffect(() => {
    const vp = window.visualViewport;
    if (!vp) return;

    const update = () => {
      // offsetTop accounts for the gap when the browser scrolls the page
      // to keep the focused input visible; we want the full visual height.
      setHeight(`${Math.round(vp.height)}px`);
    };

    update();
    vp.addEventListener('resize', update);
    vp.addEventListener('scroll', update);
    return () => {
      vp.removeEventListener('resize', update);
      vp.removeEventListener('scroll', update);
    };
  }, []);

  return height;
}

export let hasUserInteracted = false;
export const setHasUserInteracted = (val: boolean) => {
  hasUserInteracted = val;
};

export default function Room() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [viewersCount, setViewersCount] = useState<number>(0);
  const [showAdmin, setShowAdmin] = useState(false);

  useEffect(() => {
    if (!hasUserInteracted) {
      navigate('/', { replace: true });
    }
  }, [navigate]);

  const {
    roomState,
    mediaInfo,
    seekKey,
    localTime,
    localCorrectionRate,
    syncSeekTrigger,
    syncSeekPosition,
    play,
    pause,
    seek,
    setRate,
    setStatus,
    sendMessage,
    addMessageHandler,
    reportLocalTime,
    isAsyncMode,
    toggleAsyncMode
  } = useRoomSync();

  useEffect(() => {
    if (roomState?.members) {
      setViewersCount(roomState.members.length);
    }
  }, [roomState?.members]);

  const handleExit = () => {
    sendMessage({ event: 'room.leave', payload: {} });
    setTimeout(() => navigate('/'), 100);
  };

  return (
    <ChatProvider sendMessage={sendMessage} addMessageHandler={addMessageHandler} currentUserId={user?.id}>
      <RoomInner
        roomState={roomState}
        mediaInfo={mediaInfo}
        seekKey={seekKey}
        localTime={localTime}
        localCorrectionRate={localCorrectionRate}
        syncSeekTrigger={syncSeekTrigger}
        syncSeekPosition={syncSeekPosition}
        play={play}
        pause={pause}
        seek={seek}
        setRate={setRate}
        setStatus={setStatus}
        reportLocalTime={reportLocalTime}
        viewersCount={viewersCount}
        handleExit={handleExit}
        showAdmin={showAdmin}
        setShowAdmin={setShowAdmin}
        isAsyncMode={isAsyncMode}
        toggleAsyncMode={toggleAsyncMode}
      />
    </ChatProvider>
  );
}

interface RoomInnerProps {
  roomState: RoomState | null;
  mediaInfo: MediaInfo | null;
  seekKey: number;
  localTime: number;
  localCorrectionRate: number | null | undefined;
  syncSeekTrigger: number;
  syncSeekPosition: number;
  play: () => void;
  pause: () => void;
  seek: (pos: number) => void;
  setRate: (rate: number) => void;
  setStatus: (status: 'ready' | 'buffering') => void;
  reportLocalTime: (time: number) => void;
  viewersCount: number;
  handleExit: () => void;
  showAdmin: boolean;
  setShowAdmin: (show: boolean) => void;
  isAsyncMode: boolean;
  toggleAsyncMode: () => void;
}

function RoomInner({
  roomState,
  mediaInfo,
  seekKey,
  localTime,
  localCorrectionRate,
  syncSeekTrigger,
  syncSeekPosition,
  play,
  pause,
  seek,
  setRate,
  setStatus,
  reportLocalTime,
  viewersCount,
  handleExit,
  showAdmin,
  setShowAdmin,
  isAsyncMode,
  toggleAsyncMode
}: RoomInnerProps) {
  const { user } = useAuth();
  const vpHeight = useVisualViewportHeight();
  const { isOpen, setIsOpen, addLocalSystemMessage } = useChat();

  const handleToggleAsync = useCallback(() => {
    toggleAsyncMode();
    const newMode = !isAsyncMode;
    addLocalSystemMessage(newMode ? 'Local Async Mode' : 'Synced with Room', 'play');
  }, [toggleAsyncMode, isAsyncMode, addLocalSystemMessage]);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Lock body scroll for the full room session.
  // The fixed-position container prevents most scroll, but iOS Safari
  // still allows rubber-band overscroll behind it without this.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  useEffect(() => {
    const handleFullscreenChange = () => {
      const isFs = !!document.fullscreenElement;
      setIsFullscreen(isFs);
      const scr = screen as any;
      if (isFs) {
        window.history.pushState({ fullscreen: true }, '');
        if (scr.orientation && scr.orientation.lock) {
          scr.orientation.lock('landscape').catch(() => { });
        }
      } else {
        if (isOpen) {
          if (scr.orientation && scr.orientation.lock) {
            scr.orientation.lock('portrait').catch(() => { });
          }
        } else {
          if (scr.orientation && scr.orientation.unlock) {
            scr.orientation.unlock();
          }
        }
      }
    };

    const handlePopState = () => {
      if (document.fullscreenElement) {
        document.exitFullscreen().catch(() => { });
      }
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    window.addEventListener('popstate', handlePopState);
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      window.removeEventListener('popstate', handlePopState);
    };
  }, [isOpen]);

  useEffect(() => {
    const scr = screen as any;
    if (!document.fullscreenElement) {
      if (isOpen) {
        if (scr.orientation && scr.orientation.lock) {
          scr.orientation.lock('portrait').catch(() => { });
        }
      } else {
        if (scr.orientation && scr.orientation.unlock) {
          scr.orientation.unlock();
        }
      }
    }
  }, [isOpen]);

  return (
    <div
      className="fixed top-0 left-0 w-full bg-ink overflow-hidden text-paper flex flex-col lg:flex-row"
      style={{ height: vpHeight }}
    >
      {/* Video area: on mobile it's aspect-video unless fullscreen; on desktop fills height */}
      <div className={`relative flex-none w-full ${isFullscreen ? 'h-full' : 'aspect-video'} lg:aspect-auto lg:h-full ${isOpen ? 'lg:flex-1 lg:mr-[360px]' : 'lg:flex-1'} transition-all duration-300`}>
        <VideoPlayer
          mediaInfo={mediaInfo}
          seekKey={seekKey}
          roomPlaybackState={roomState?.playback}
          localTime={localTime}
          localCorrectionRate={localCorrectionRate}
          syncSeekTrigger={syncSeekTrigger}
          syncSeekPosition={syncSeekPosition}
          onPlay={play}
          onPause={pause}
          onSeek={seek}
          onSetRate={setRate}
          onStatusChange={setStatus}
          onReportTime={reportLocalTime}
          showChat={isOpen}
          onToggleChat={() => setIsOpen(!isOpen)}
          isFullscreen={isFullscreen}
          isAsyncMode={isAsyncMode}
          onToggleAsync={handleToggleAsync}
          userId={user?.id}
        >
          <div className="flex justify-between items-center px-3 sm:px-4 lg:px-6 py-2 sm:py-3 lg:py-4 bg-gradient-to-b from-ink/80 to-transparent relative">
            <div className="flex-none flex justify-start w-14 sm:w-20 lg:w-24">
              {!isFullscreen && (
                <button onClick={handleExit} className="flex items-center text-[11px] sm:text-14 lg:text-base uppercase tracking-[0.08em] hover:text-fog transition-colors whitespace-nowrap">
                  <ChevronLeft className="mr-0.5 lg:mr-1 w-[14px] h-[14px] lg:w-4 lg:h-4" /> Exit
                </button>
              )}
            </div>

            <div className="flex-1 flex justify-center text-[11px] sm:text-14 lg:text-base uppercase tracking-[0.08em] items-center gap-1 sm:gap-2 lg:gap-3 drop-shadow-md min-w-0">
              <span className="truncate max-w-[120px] sm:max-w-[200px] lg:max-w-[500px]">{mediaInfo?.title || 'ROOM'}</span>
              <span className="shrink-0">·</span>
              <span className="font-mono text-blue-400 shrink-0">{viewersCount}</span>
              <span className="hidden xs:inline shrink-0">WATCHING</span>
            </div>

            <div className="flex-none flex justify-end w-14 sm:w-20 lg:w-24">
              {user?.role === 'root' && (
                <button onClick={() => setShowAdmin(true)} className="flex items-center text-[11px] sm:text-14 lg:text-base uppercase tracking-[0.08em] hover:text-fog transition-colors">
                  <span className="hidden sm:inline">Manage</span>
                  <Settings2 className="sm:ml-1 lg:ml-2 w-[14px] h-[14px] lg:w-4 lg:h-4" />
                </button>
              )}
            </div>
          </div>
        </VideoPlayer>
        {/* Chat toasts: absolute overlay on the video, works on mobile + desktop */}
        <ChatToasts />
      </div>

      <ChatSidebar />

      {user?.role === 'root' && (
        <AdminOverlay isOpen={showAdmin} onClose={() => setShowAdmin(false)} mediaTitle={roomState?.mediaTitle} />
      )}
    </div>
  );
}
