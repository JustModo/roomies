import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, Settings2 } from 'lucide-react';
import { AdminOverlay } from '../components/room/AdminOverlay';
import { useRoomSync } from '../hooks/useRoomSync';
import { useAuth } from '../contexts/AuthContext';
import { VideoPlayer } from '../components/room/VideoPlayer';
import { ChatProvider, useChat } from '../contexts/ChatContext';
import { ChatSidebar } from '../components/room/ChatSidebar';

export let hasUserInteracted = false;
export const setHasUserInteracted = (val: boolean) => {
  hasUserInteracted = val;
};

export default function Room() {
  const navigate = useNavigate();
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
    <ChatProvider sendMessage={sendMessage} addMessageHandler={addMessageHandler}>
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
        viewersCount={viewersCount}
        handleExit={handleExit}
        showAdmin={showAdmin}
        setShowAdmin={setShowAdmin}
      />
    </ChatProvider>
  );
}

interface RoomInnerProps {
  roomState: any;
  mediaInfo: any;
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
  viewersCount: number;
  handleExit: () => void;
  showAdmin: boolean;
  setShowAdmin: (show: boolean) => void;
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
  viewersCount,
  handleExit,
  showAdmin,
  setShowAdmin,
}: RoomInnerProps) {
  const { user } = useAuth();
  const { isOpen, setIsOpen } = useChat();

  return (
    <div className="relative w-full h-screen bg-ink overflow-hidden text-paper flex">
      <div className={`flex-1 h-full transition-all duration-300 relative ${isOpen ? 'mr-[360px]' : ''}`}>
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
          showChat={isOpen}
          onToggleChat={() => setIsOpen(!isOpen)}
        >
          <div className="flex justify-between items-center px-4 py-3 bg-gradient-to-b from-ink/80 to-transparent relative">
            <div className="flex-1 flex justify-start">
              <button onClick={handleExit} className="flex items-center text-14 uppercase tracking-[0.08em] hover:text-fog transition-colors">
                <ChevronLeft size={16} className="mr-1" /> Exit
              </button>
            </div>
            
            <div className="flex-1 flex justify-center text-14 uppercase tracking-[0.08em] items-center gap-2 drop-shadow-md whitespace-nowrap">
              {mediaInfo?.title || 'ROOM'} · <span className="font-mono text-14 text-blue-400">{viewersCount}</span> WATCHING
            </div>
            
            <div className="flex-1 flex justify-end">
              {user?.role === 'root' && (
                <button onClick={() => setShowAdmin(true)} className="flex items-center text-14 uppercase tracking-[0.08em] hover:text-fog transition-colors">
                  Manage <Settings2 size={16} className="ml-1" />
                </button>
              )}
            </div>
          </div>
        </VideoPlayer>
      </div>

      <ChatSidebar />

      {user?.role === 'root' && (
        <AdminOverlay isOpen={showAdmin} onClose={() => setShowAdmin(false)} />
      )}
    </div>
  );
}
