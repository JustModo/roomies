import { useState, useEffect, useCallback, lazy, Suspense } from 'react';
import { ErrorBoundary } from '../../app/ErrorBoundary';
import { Navigate, useNavigate } from 'react-router-dom';
import { Mic, MicOff } from 'lucide-react';
import { useHotkeys } from '../../lib/keyboard';
import { useAuth } from '../auth/AuthContext';
import { ChatProvider } from '../chat/ChatContext';
import { ChatToasts } from '../chat/ChatToasts';
import { VideoPlayer } from '../player/VideoPlayer';
import { ReactionsProvider } from '../reactions/ReactionsContext';
import { PrefsProvider } from '../settings/PrefsContext';
import { VoiceProvider, useActiveSpeakers } from '../voice/VoiceContext';
import { PresentationProvider, usePresentation } from './PresentationContext';
import { RoomProvider, useMe, useMediaInfo, usePlayback, useRoomConnection, useRoomSelector } from './RoomProvider';
import { Sidebar } from './Sidebar';
import { SidebarProvider, useSidebar } from './SidebarContext';
import { TopBar } from './TopBar';
import { HomeScreenHint } from './HomeScreenHint';
import { useVisualViewportVars } from './useVisualViewportVars';
import { hasUserInteracted } from './userInteraction';

const AdminOverlay = lazy(() => import('../admin/AdminOverlay').then((m) => ({ default: m.AdminOverlay })));

export default function Room() {
  if (!hasUserInteracted) {
    return <Navigate to="/" replace />;
  }
  return (
    <RoomProvider>
      <PresentationProvider>
        <SidebarProvider>
          <PrefsProvider>
            <ChatProvider>
              <ReactionsProvider>
                <VoiceProvider>
                  <RoomLayout />
                </VoiceProvider>
              </ReactionsProvider>
            </ChatProvider>
          </PrefsProvider>
        </SidebarProvider>
      </PresentationProvider>
    </RoomProvider>
  );
}

function RoomLayout() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const mediaInfo = useMediaInfo();
  const allowAsyncMode = useRoomSelector((s) => s.room?.settings.allowAsyncMode ?? true);
  const mediaTitle = useRoomSelector((s) => s.room?.mediaTitle);
  const me = useMe();
  const playback = usePlayback();
  const { actions } = useRoomConnection();
  const { isFullscreen, toggleFullscreen, registerRoot, controlsVisible } = usePresentation();
  const { isOpen, available: sidebarAvailable, setOpen, docked, openChat } = useSidebar();
  const activeSpeakers = useActiveSpeakers();
  const [showAdmin, setShowAdmin] = useState(false);
  useVisualViewportVars();

  const isJoined = me?.party.isJoined ?? false;
  const isMicMuted = me?.party.micMuted ?? true;
  const isActiveSpeaker = activeSpeakers.has('local');

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  const handleExit = () => {
    actions.leave();
    setTimeout(() => navigate('/'), 100);
  };

  const toggleMic = useCallback(() => actions.updateParty({ micMuted: !isMicMuted }), [actions, isMicMuted]);

  useHotkeys({
    ...(isOpen || !sidebarAvailable ? {} : { t: openChat }),
    ...(isJoined ? { m: toggleMic } : {}),
  });

  return (
    <div
      id="room-root"
      ref={registerRoot}
      className={`fixed inset-x-0 bg-ink overflow-hidden text-paper flex ${docked ? 'flex-col' : 'flex-row'}`}
      style={{ top: 'var(--vvt, 0px)', height: 'var(--vvh, 100dvh)' }}
    >
      <div
        className={`relative ${docked ? 'w-full flex-none aspect-video max-h-[60vh]' : 'flex-1 min-w-0 h-full'}`}
      >
        <VideoPlayer
          mediaInfo={mediaInfo}
          seekKey={mediaInfo?.seekKey ?? 0}
          roomPlaybackState={playback.playback ?? undefined}
          localTimeRef={playback.localTimeRef}
          localCorrectionRate={playback.correctionRate}
          seekCommand={playback.seekCommand}
          onPlay={playback.play}
          onPause={playback.pause}
          onSeek={playback.seek}
          onSetRate={playback.setRate}
          onStatusChange={playback.setStatus}
          onReportTime={playback.reportTime}
          onReportResolution={playback.reportResolution}
          showChat={isOpen}
          onToggleChat={sidebarAvailable ? () => setOpen(!isOpen) : undefined}
          isFullscreen={isFullscreen}
          onToggleFullscreen={toggleFullscreen}
          isAsyncMode={playback.isAsync}
          onToggleAsync={playback.toggleAsync}
          allowAsyncMode={allowAsyncMode}
          isLockedByAdmin={me?.controlsLocked}
          onForceResume={user?.role === 'root' ? actions.forceResume : undefined}
          isPartyJoined={isJoined}
          isMicMuted={isMicMuted}
          onToggleMic={toggleMic}
          docked={docked}
        >
          {(lockState) => <TopBar {...lockState} onExit={handleExit} onManage={() => setShowAdmin(true)} />}
        </VideoPlayer>
        <ChatToasts />
        <HomeScreenHint />

        {isJoined && (
          <div className={`absolute right-6 z-60 pointer-events-none opacity-30 drop-shadow-md transition-all duration-300 ${controlsVisible ? 'bottom-20 lg:bottom-24' : 'bottom-8'}`}>
            {isMicMuted ? (
              <MicOff size={28} className="text-danger" strokeWidth={1.5} />
            ) : (
              <Mic size={28} className={`transition-colors duration-200 ${isActiveSpeaker ? 'text-success' : 'text-paper'}`} strokeWidth={1.5} />
            )}
          </div>
        )}
      </div>

      <Sidebar />

      {user?.role === 'root' && (
        <ErrorBoundary>
          <Suspense fallback={null}>
            <AdminOverlay isOpen={showAdmin} onClose={() => setShowAdmin(false)} mediaTitle={mediaTitle} />
          </Suspense>
        </ErrorBoundary>
      )}
    </div>
  );
}
