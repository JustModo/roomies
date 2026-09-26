import React from 'react';
import { Volume2 } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { useActiveMenu } from '../../ui/useActiveMenu';
import { useMe, useRoomInfo, useRoomSelector } from '../room/RoomProvider';
import { PartyMember } from './PartyMember';
import { Slider } from '../../ui/Slider';
import { PartyControls } from './PartyControls';
import { useActiveSpeakers, useVoice } from './VoiceContext';

export const PartySection: React.FC = () => {
  const members = useRoomInfo()?.members ?? [];
  const isWaiting = useRoomSelector((s) => s.playback?.state === 'waiting');
  const me = useMe();
  const { user } = useAuth();
  const { activeMenu, toggleMenu, containerRef } = useActiveMenu<string>();
  const isJoined = me?.party.isJoined ?? false;
  const isMicMuted = me?.party.micMuted ?? true;

  const { joinVoice, localStates, updateLocalState, masterVolume, setMasterVolume } = useVoice();
  const activeSpeakers = useActiveSpeakers();

  return (
    <div ref={containerRef} className="flex-1 flex flex-col min-h-0 bg-void">
      {/* Master volume — scales every peer's individual volume together */}
      <div className="flex items-center gap-2 px-4 pt-3 pb-1 shrink-0 border-b border-ash/10">
        <Volume2 size={14} className="text-paper/50 shrink-0" />
        <Slider value={masterVolume} max={100} onChange={setMasterVolume} label="Master voice volume" />
        <span className="text-11 font-mono text-paper/50 w-9 text-right select-none leading-none">
          {masterVolume}%
        </span>
      </div>

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
          const isLocalUser = member.userId === user?.id;
          const isActiveSpeaker = isLocalUser ? activeSpeakers.has('local') : activeSpeakers.has(member.userId);

          return (
            <PartyMember
              key={member.userId}
              member={member}
              user={user}
              isWaiting={isWaiting}
              activeMenu={activeMenu}
              toggleMenu={toggleMenu}
              localState={localStates[member.userId]}
              onUpdateLocalState={(updates) => updateLocalState(member.userId, updates)}
              isActiveSpeaker={isActiveSpeaker}
            />
          );
        })}
      </div>

      <PartyControls
        isJoined={isJoined}
        isMicMuted={isMicMuted}
        onJoin={joinVoice}
      />
    </div>
  );
};
