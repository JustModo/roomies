import React from 'react';
import { MicOff, VideoOff, Mic, Video, Lock, SignalHigh, SignalMedium, SignalLow, PhoneOff } from 'lucide-react';
import { getUsernameColor } from '../Chat/utils';
import { MemberState } from '../../hooks/useRoomSync';
import { LocalMemberState } from './PartySection';
import { UserProfile } from '@roomies/contracts';


interface PartyMemberProps {
  member: MemberState;
  user: UserProfile | null;
  roomPlaybackState?: string;
  activeMenu: string | null;
  toggleMenu: (id: string) => void;
  localState?: LocalMemberState;
  onUpdateLocalState: (updates: Partial<LocalMemberState>) => void;
}

export const PartyMember: React.FC<PartyMemberProps> = ({ member, user, roomPlaybackState, activeMenu, toggleMenu, localState, onUpdateLocalState }) => {
  const isLocallyMuted = localState?.audioMuted ?? false;
  const isVideoLocallyMuted = localState?.videoMuted ?? false;
  const volume = localState?.volume ?? 100;
  let statusText = '';
  if (roomPlaybackState === 'waiting') {
    statusText = 'Waiting';
  } else if (member.status === 'async') {
    statusText = 'Async';
  } else if (member.status === 'buffering') {
    statusText = 'Syncing';
  }

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
    <div className="flex flex-col">
      <button
        onClick={() => {
          if (member.userId !== user?.id) {
            toggleMenu(member.userId);
          }
        }}
        className={`w-full flex items-center justify-between p-2 rounded transition-colors ${member.userId !== user?.id ? 'hover:bg-ash/5 cursor-pointer' : 'cursor-default'
          } ${activeMenu === member.userId ? 'bg-black/20 rounded-b-none' : ''}`}
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
          {/* Party Status Icons */}
          {member.party.isJoined ? (
            <>
              {isLocallyMuted ? (
                <MicOff size={14} className="text-red-400" />
              ) : member.party.micMuted ? (
                <MicOff size={14} className="text-paper/40" />
              ) : (
                <Mic size={14} className="text-green-400" />
              )}
              {isVideoLocallyMuted ? (
                <VideoOff size={14} className="text-red-400" />
              ) : member.party.videoMuted ? (
                <VideoOff size={14} className="text-paper/40" />
              ) : (
                <Video size={14} className="text-green-400" />
              )}
              {getPingIcon(member.ping)}
            </>
          ) : (
            <>
              <PhoneOff size={14} className="text-paper/30" />
              {getPingIcon(member.ping)}
            </>
          )}
        </div>
      </button>

      {/* Accordion Menu */}
      {activeMenu === member.userId && member.userId !== user?.id && (
        <div className="w-full px-2 pb-2 pt-1 flex flex-col gap-1 bg-black/20 rounded-b border-t border-black/40 shadow-inner">
          {user?.id !== member.userId && (
            <div className="flex items-center gap-1">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onUpdateLocalState({ audioMuted: !isLocallyMuted });
                }}
                className={`w-8 h-8 flex shrink-0 items-center justify-center transition-colors hover:bg-ash/10 rounded ${isLocallyMuted ? 'text-red-400/80 hover:text-red-400' : 'text-paper/60 hover:text-paper'
                  }`}
                title={isLocallyMuted ? "Unmute audio" : "Mute audio"}
              >
                {isLocallyMuted ? <MicOff size={16} strokeWidth={1.5} /> : <Mic size={16} strokeWidth={1.5} />}
              </button>

              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onUpdateLocalState({ videoMuted: !isVideoLocallyMuted });
                }}
                className={`w-8 h-8 flex shrink-0 items-center justify-center transition-colors hover:bg-ash/10 rounded ${isVideoLocallyMuted ? 'text-red-400/80 hover:text-red-400' : 'text-paper/60 hover:text-paper'
                  }`}
                title={isVideoLocallyMuted ? "Unmute video" : "Mute video"}
              >
                {isVideoLocallyMuted ? <VideoOff size={16} strokeWidth={1.5} /> : <Video size={16} strokeWidth={1.5} />}
              </button>

              <div className="flex-1 flex items-center gap-3 px-2">
                <input
                  type="range"
                  min="0"
                  max="200"
                  value={volume}
                  onChange={(e) => onUpdateLocalState({ volume: parseInt(e.target.value) })}
                  className="volume-slider w-full h-1 rounded cursor-pointer appearance-none outline-none opacity-70 hover:opacity-100 transition-opacity"
                  style={{
                    background: `linear-gradient(to right, rgb(160 160 160) 0%, rgb(160 160 160) ${volume / 2}%, rgb(255 255 255 / 0.1) ${volume / 2}%, rgb(255 255 255 / 0.1) 100%)`
                  }}
                />
                <span className="text-[10px] font-mono text-paper/50 w-7 text-right select-none leading-none">{volume}%</span>
              </div>
            </div>
          )}
          {user?.role === 'root' && (
            <button className="w-full px-2 py-1.5 text-left text-12 text-paper/80 hover:text-paper hover:bg-ash/10 rounded transition-colors flex items-center gap-2">
              <Lock size={14} />
              Lock controls
            </button>
          )}
        </div>
      )}
    </div>
  );
};
