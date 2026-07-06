import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, Settings2 } from 'lucide-react';
import { AdminOverlay } from '../components/room/AdminOverlay';
import { useRoomSync } from '../hooks/useRoomSync';
import { VideoPlayer } from '../components/room/VideoPlayer';

export default function Room() {
  const navigate = useNavigate();
  const [viewersCount, setViewersCount] = useState<number>(0);
  const [showAdmin, setShowAdmin] = useState(false);

  const {
    roomState,
    mediaInfo,
    localTime,
    play,
    pause,
    seek,
    setRate,
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

  return (
    <div className="relative w-full h-screen bg-ink overflow-hidden text-paper">
      <VideoPlayer
        mediaInfo={mediaInfo}
        roomPlaybackState={roomState?.playback}
        localTime={localTime}
        onPlay={play}
        onPause={pause}
        onSeek={seek}
        onSetRate={setRate}
        onReady={ready}
        onNotReady={notReady}
        onBuffering={buffering}
        onBuffered={buffered}
      >
        <div className="flex justify-between items-center px-4 py-3 bg-gradient-to-b from-ink/80 to-transparent">
          <button onClick={() => navigate('/')} className="flex items-center text-14 uppercase tracking-[0.08em] hover:text-fog transition-colors">
            <ChevronLeft size={16} className="mr-1" /> Exit
          </button>
          
          <div className="text-14 uppercase tracking-[0.08em] flex items-center gap-2 drop-shadow-md">
            {mediaInfo?.title || 'ROOM'} · <span className="font-mono text-14 text-blue-400">{viewersCount}</span> WATCHING
          </div>
          
          <button onClick={() => setShowAdmin(true)} className="flex items-center text-14 uppercase tracking-[0.08em] hover:text-fog transition-colors">
            Manage <Settings2 size={16} className="ml-1" />
          </button>
        </div>
      </VideoPlayer>

      <AdminOverlay isOpen={showAdmin} onClose={() => setShowAdmin(false)} />
    </div>
  );
}
