import React from 'react';
import { MicOff, Mic, Lock, Unlock, SignalHigh, SignalMedium, SignalLow, PhoneOff } from 'lucide-react';
import { getUsernameColor } from '../chat/utils';
import { MemberState } from '@roomies/contracts';
import { UserProfile } from '@roomies/contracts';
import { LocalMemberState } from './VoiceContext';
import { Slider } from '../../ui/Slider';
import { useReactions } from '../reactions/ReactionsContext';
import { usePrefs } from '../settings/PrefsContext';
import { useRoomConnection } from '../room/RoomProvider';

interface PartyMemberProps {
  member: MemberState;
  user: UserProfile | null;
  isWaiting: boolean;
  activeMenu: string | null;
  toggleMenu: (id: string) => void;
  localState?: LocalMemberState;
  onUpdateLocalState: (updates: Partial<LocalMemberState>) => void;
  isActiveSpeaker: boolean;
}

export const PartyMember: React.FC<PartyMemberProps> = ({
  member,
  user,
  isWaiting,
  activeMenu,
  toggleMenu,
  localState,
  onUpdateLocalState,
  isActiveSpeaker,
}) => {
  const isLocallyMuted = localState?.audioMuted ?? false;
  const volume = localState?.volume ?? 100;
  const { reactions } = useReactions();
  const { emojiMuted } = usePrefs();
  const { setControlLock } = useRoomConnection().actions;
  const myReaction = reactions.filter((r) => r.userId === member.userId).pop();

  let statusText = '';
  if (isWaiting) {
    statusText = 'Waiting';
  } else if (member.status === 'async') {
    statusText = 'Async';
  } else if (member.status === 'buffering') {
    statusText = 'Syncing';
  }

  const getPingIcon = (pingQuality?: number) => {
    if (pingQuality === undefined || pingQuality === 0) {
      return <SignalHigh size={14} className="text-success" />;
    } else if (pingQuality === 1) {
      return <SignalMedium size={14} className="text-warn" />;
    }
    return <SignalLow size={14} className="text-danger" />;
  };

  return (
    <div className="flex flex-col">
      {/* Audio is played via AudioContext inside AudioRelay — no <audio> element needed */}
      <button
        onClick={() => {
          if (member.userId !== user?.id) {
            toggleMenu(member.userId);
          }
        }}
        className={`w-full flex items-center justify-between py-2 transition-colors ${
          member.userId !== user?.id ? 'hover:bg-ash/5 cursor-pointer' : 'cursor-default'
        } ${activeMenu === member.userId ? 'bg-ink/20 ' : ''}`}
      >
        <div className="flex items-center gap-3">
          <div
            className="w-8 h-8 bg-ash/20 flex items-center justify-center font-bold"
            style={{ color: getUsernameColor(member.username) }}
          >
            {member.username.charAt(0).toUpperCase()}
          </div>
          <div className="flex items-center gap-1">
            <span className="text-14 font-medium capitalize" style={{ color: getUsernameColor(member.username) }}>
              {member.username}{' '}
              {user?.id === member.userId && (
                <span className="text-paper/40 text-12 ml-1 normal-case">(You)</span>
              )}
            </span>
            {statusText && <span className="text-12 text-paper/50">{statusText}</span>}
            {!emojiMuted && myReaction && (
              <span className="inline-block animate-bounce-in ml-1" style={{ fontSize: '1rem', lineHeight: '1' }}>
                {myReaction.emoji}
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Party Status Icons */}
          {member.party.isJoined ? (
            <>
              {isLocallyMuted ? (
                <MicOff size={14} className="text-danger" />
              ) : member.party.micMuted ? (
                <MicOff size={14} className="text-paper/40" />
              ) : (
                <Mic size={14} className={`transition-colors duration-500 ${isActiveSpeaker ? "text-success" : "text-paper/60"}`} />
              )}

              {getPingIcon(member.pingQuality)}
            </>
          ) : (
            <>
              <PhoneOff size={14} className="text-paper/30" />
              {getPingIcon(member.pingQuality)}
            </>
          )}
        </div>
      </button>

      {/* Per-peer volume/mute accordion — only for other users */}
      {activeMenu === member.userId && member.userId !== user?.id && (
        <div className="w-full px-2 pb-2 pt-1 flex flex-col gap-1 bg-ink/20 border-t border-ink/40 ">
          {user?.id !== member.userId && (
            <div className="flex items-center gap-1">
              {/* Local mute toggle — silences this peer's AudioContext GainNode */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onUpdateLocalState({ audioMuted: !isLocallyMuted });
                }}
                className={`w-8 h-8 flex shrink-0 items-center justify-center transition-colors hover:bg-ash/10 ${
                  isLocallyMuted ? 'text-danger/80 hover:text-danger' : 'text-paper/60 hover:text-paper'
                }`}
                title={isLocallyMuted ? 'Unmute audio' : 'Mute audio'}
              >
                {isLocallyMuted ? (
                  <MicOff size={16} strokeWidth={1.5} />
                ) : (
                  <Mic size={16} strokeWidth={1.5} />
                )}
              </button>

              {/* Volume slider — maps to AudioRelay.setVolume via onUpdateLocalState */}
              <div className="flex-1 flex items-center gap-3 px-2">
                <Slider value={volume} max={200} onChange={(v) => onUpdateLocalState({ volume: v })} label="Voice volume" />
                <span className="text-11 font-mono text-paper/50 w-7 text-right select-none leading-none">
                  {volume}%
                </span>
              </div>
            </div>
          )}

          {user?.role === 'root' && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                setControlLock(member.userId, !member.controlsLocked);
              }}
              className={`w-full px-2 py-1.5 text-left text-12 transition-colors flex items-center gap-2 ${
                member.controlsLocked
                  ? 'text-danger/90 hover:text-danger hover:bg-danger/10'
                  : 'text-paper/80 hover:text-paper hover:bg-ash/10'
              }`}
            >
              {member.controlsLocked ? <Unlock size={14} /> : <Lock size={14} />}
              {member.controlsLocked ? 'Unlock controls' : 'Lock controls'}
            </button>
          )}
        </div>
      )}
    </div>
  );
};
