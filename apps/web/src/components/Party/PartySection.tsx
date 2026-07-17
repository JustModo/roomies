import React, { useRef, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { getUsernameColor } from '../Chat/utils';
import { useActiveMenu } from '../../hooks/useActiveMenu';
import { RoomState } from '../../hooks/useRoomSync';
import { MicOff, VideoOff, Mic, Video, Lock, SignalHigh, SignalMedium, SignalLow, PhoneOff } from 'lucide-react';

interface PartySectionProps {
  roomState: RoomState | null;
}

export const PartySection: React.FC<PartySectionProps> = ({ roomState }) => {
  const members = roomState?.members || [];
  const roomPlaybackState = roomState?.playback?.state;
  const { user } = useAuth();
  const { activeMenu, toggleMenu, containerRef } = useActiveMenu<string>();
  const [isJoined, setIsJoined] = useState(false);

  const getPingIcon = (ping?: number) => {
    if (ping === undefined || ping < 150) {
      return <SignalHigh size={14} className="text-green-500" />;
    } else if (ping < 300) {
      return <SignalMedium size={14} className="text-yellow-500" />;
    } else {
      return <SignalLow size={14} className="text-red-500" />;
    }
  };

  return (
    <div ref={containerRef} className="flex-1 flex flex-col min-h-0 bg-void">
      {/* Users List */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-2">
        <h3 className="text-12 font-semibold uppercase tracking-widest text-paper/80 mb-4">
          IN ROOM ({members.length})
        </h3>
        
        {[...members].sort((a, b) => {
          if (a.userId === user?.id) return -1;
          if (b.userId === user?.id) return 1;
          return 0;
        }).map((member) => {
          let statusText = '';
          if (roomPlaybackState === 'waiting') {
            statusText = 'Waiting';
          } else if (member.status === 'async') {
            statusText = 'Async';
          } else if (member.status === 'buffering') {
            statusText = 'Syncing';
          }

          return (
          <div key={member.userId} className="relative">
            <button
              onClick={() => {
                if (member.userId !== user?.id) {
                  toggleMenu(member.userId);
                }
              }}
              className={`w-full flex items-center justify-between p-2 rounded transition-colors ${
                member.userId !== user?.id ? 'hover:bg-ash/5 cursor-pointer' : 'cursor-default'
              }`}
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-ash/20 flex items-center justify-center font-bold" style={{ color: getUsernameColor(member.username) }}>
                  {member.username.charAt(0).toUpperCase()}
                </div>
                <div className="flex flex-col items-start text-left">
                  <span className="text-14 font-medium capitalize" style={{ color: getUsernameColor(member.username) }}>
                    {member.username} {user?.id === member.userId && <span className="text-paper/40 text-12 ml-1 normal-case">(You)</span>}
                  </span>
                  {statusText && <span className="text-12 text-paper/50">{statusText}</span>}
                </div>
              </div>
              
              <div className="flex items-center gap-2">
                {/* Mocked Party Status Icons */}
                {member.userId === user?.id ? (
                  isJoined ? (
                    <>
                      <Mic size={14} className="text-paper/60" />
                      <Video size={14} className="text-paper/60" />
                      {getPingIcon(member.ping)}
                    </>
                  ) : (
                    <>
                      <PhoneOff size={14} className="text-paper/30" />
                      {getPingIcon(member.ping)}
                    </>
                  )
                ) : (
                  <>
                    <Mic size={14} className="text-paper/60" />
                    <Video size={14} className="text-paper/60" />
                    {getPingIcon(member.ping)}
                  </>
                )}
              </div>
            </button>

            {/* Dropdown Menu */}
            {activeMenu === member.userId && member.userId !== user?.id && (
              <div className="absolute right-0 top-12 w-48 bg-ink border border-ash/20 rounded shadow-xl z-50 py-1">
                {user?.id !== member.userId && (
                  <button className="w-full px-4 py-2 text-left text-13 text-paper hover:bg-ash/10 flex items-center gap-2">
                    <MicOff size={14} />
                    Mute for me
                  </button>
                )}
                {user?.role === 'root' && (
                  <button className="w-full px-4 py-2 text-left text-13 text-paper hover:bg-ash/10 flex items-center gap-2">
                    <Lock size={14} />
                    Lock controls
                  </button>
                )}
              </div>
            )}
          </div>
        )})}
      </div>

      {/* Bottom Bar: Join / Controls */}
      <div className="shrink-0 border-t border-ash/20 bg-ink p-4">
        {!isJoined ? (
          <button
            onClick={() => setIsJoined(true)}
            className="w-full py-3 bg-blue-600 hover:bg-blue-500 text-white text-13 font-bold uppercase tracking-wider rounded transition-colors"
          >
            Join Party Channel
          </button>
        ) : (
          <div className="flex items-center justify-center gap-4">
            <button className="w-12 h-12 rounded-full bg-ash/20 hover:bg-ash/30 flex items-center justify-center text-paper transition-colors">
              <Mic size={20} />
            </button>
            <button className="w-12 h-12 rounded-full bg-ash/20 hover:bg-ash/30 flex items-center justify-center text-paper transition-colors">
              <Video size={20} />
            </button>
            <button
              onClick={() => setIsJoined(false)}
              className="px-4 py-2 text-13 font-medium text-red-400 hover:bg-red-400/10 rounded transition-colors ml-auto"
            >
              Leave
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
