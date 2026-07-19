import React, { useState } from 'react';
import { MicOff, VideoOff, Mic, Video, Loader2 } from 'lucide-react';

interface PartyControlsProps {
  isJoined: boolean;
  isMicMuted: boolean;
  isVideoMuted: boolean;
  updatePartyState: (updates: { isJoined?: boolean; micMuted?: boolean; videoMuted?: boolean }) => void;
  onJoin: () => Promise<void>;
}

export const PartyControls: React.FC<PartyControlsProps> = ({
  isJoined,
  isMicMuted,
  isVideoMuted,
  updatePartyState,
  onJoin,
}) => {
  const [isJoining, setIsJoining] = useState(false);

  const handleJoin = async () => {
    setIsJoining(true);
    try {
      await onJoin();
      updatePartyState({ isJoined: true, micMuted: true, videoMuted: true });
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to access microphone.');
    } finally {
      setIsJoining(false);
    }
  };

  return (
    <div className="shrink-0 border-t border-ash/10 bg-ink p-2 sm:p-3">
      {!isJoined ? (
        <button
          onClick={handleJoin}
          disabled={isJoining}
          className="w-full py-2 bg-ash/5 hover:bg-ash/10 disabled:opacity-50 disabled:cursor-not-allowed border border-ash/10 text-paper text-12 font-semibold uppercase tracking-widest transition-all flex items-center justify-center gap-2"
        >
          {isJoining ? (
            <>
              <Loader2 size={14} className="animate-spin" />
              Connecting…
            </>
          ) : (
            'Join Party Channel'
          )}
        </button>
      ) : (
        <div className="flex items-center gap-1 sm:gap-2">
          <button
            onClick={() => updatePartyState({ micMuted: !isMicMuted })}
            className={`w-8 h-8 flex items-center justify-center transition-colors hover:bg-ash/10 ${
              isMicMuted ? 'text-red-400/80 hover:text-red-400' : 'text-paper/60 hover:text-paper'
            }`}
            title={isMicMuted ? 'Unmute microphone' : 'Mute microphone'}
          >
            {isMicMuted ? <MicOff size={16} strokeWidth={1.5} /> : <Mic size={16} strokeWidth={1.5} />}
          </button>
          <button
            onClick={() => updatePartyState({ videoMuted: !isVideoMuted })}
            className={`w-8 h-8 flex items-center justify-center transition-colors hover:bg-ash/10 ${
              isVideoMuted ? 'text-red-400/80 hover:text-red-400' : 'text-paper/60 hover:text-paper'
            }`}
            title={isVideoMuted ? 'Enable video' : 'Disable video'}
          >
            {isVideoMuted ? <VideoOff size={16} strokeWidth={1.5} /> : <Video size={16} strokeWidth={1.5} />}
          </button>
          <button
            onClick={() => updatePartyState({ isJoined: false })}
            className="px-3 py-1.5 text-12 font-semibold uppercase tracking-widest text-red-400/70 hover:text-red-400 hover:bg-red-400/5 transition-colors ml-auto"
          >
            Leave
          </button>
        </div>
      )}
    </div>
  );
};
