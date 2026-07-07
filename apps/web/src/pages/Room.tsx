import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, Settings2 } from 'lucide-react';
import { AdminOverlay } from '../components/room/AdminOverlay';
import { useRoomSync } from '../hooks/useRoomSync';
import { useAuth } from '../contexts/AuthContext';
import { VideoPlayer } from '../components/room/VideoPlayer';

export default function Room() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [viewersCount, setViewersCount] = useState<number>(0);
  const [showAdmin, setShowAdmin] = useState(false);

  const {
    roomState,
    mediaInfo,
    seekKey,
    localTime,
    localCorrectionRate,
    play,
    pause,
    seek,
    setRate,
    setStatus,
    sendMessage,
  } = useRoomSync();

  useEffect(() => { 
    if (roomState?.members) {
      setViewersCount(roomState.members.length);
    }
  }, [roomState?.members]);

  const handleExit = () => {
    // Explicitly send the leave event before the websocket unmounts and closes,
    // to prevent race conditions with the Lobby fetching the active playback state.
    sendMessage({ event: 'room.leave', payload: {} });
    setTimeout(() => navigate('/'), 100);
  };

  return (
    <div className="relative w-full h-screen bg-ink overflow-hidden text-paper">
      <VideoPlayer
        mediaInfo={mediaInfo}
        seekKey={seekKey}
        roomPlaybackState={roomState?.playback}
        localTime={localTime}
        localCorrectionRate={localCorrectionRate}
        onPlay={play}
        onPause={pause}
        onSeek={seek}
        onSetRate={setRate}
        onStatusChange={setStatus}
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

      {user?.role === 'root' && (
        <AdminOverlay isOpen={showAdmin} onClose={() => setShowAdmin(false)} />
      )}
    </div>
  );
}
