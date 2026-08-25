import React from 'react';
import { Volume2 } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useActiveMenu } from '../../hooks/useActiveMenu';
import { RoomState } from '@roomies/contracts';
import { PartyMember } from './PartyMember';
import { PartyControls } from './PartyControls';
import { useVoice } from '../../contexts/VoiceContext';

interface PartySectionProps {
  roomState: RoomState | null;
  updatePartyState: (updates: { isJoined?: boolean, micMuted?: boolean, videoMuted?: boolean }) => void;
  setControlLock: (userId: string, locked: boolean) => void;
  addMessageHandler: (handler: (msg: any) => void) => () => void;
  sendMessage: (msg: any) => void;
}

export interface LocalMemberState {
  audioMuted: boolean;
  volume: number;
}

export const PartySection: React.FC<PartySectionProps> = ({
  roomState,
  updatePartyState,
  setControlLock,
}) => {
  const members = roomState?.members || [];
  const roomPlaybackState = roomState?.playback?.state;
  const { user } = useAuth();
  const { activeMenu, toggleMenu, containerRef } = useActiveMenu<string>();

  const currentUserMember = members.find(m => m.userId === user?.id);
  const isJoined = currentUserMember?.party.isJoined ?? false;
  const isMicMuted = currentUserMember?.party.micMuted ?? true;

  const { joinVoice, localStates, updateLocalState, activeSpeakers, masterVolume, setMasterVolume } = useVoice();

  return (
    <div ref={containerRef} className="flex-1 flex flex-col min-h-0 bg-void">
      {/* Master volume — scales every peer's individual volume together */}
      <div className="flex items-center gap-2 px-4 pt-3 pb-1 shrink-0 border-b border-ash/10">
        <Volume2 size={14} className="text-paper/50 shrink-0" />
        <input
          type="range"
          min="0"
          max="100"
          value={masterVolume}
          onChange={(e) => setMasterVolume(parseInt(e.target.value))}
          className="volume-slider w-full h-1 rounded cursor-pointer appearance-none outline-none opacity-70 hover:opacity-100 transition-opacity"
          style={{
            background: `linear-gradient(to right, rgb(160 160 160) 0%, rgb(160 160 160) ${masterVolume}%, rgb(255 255 255 / 0.1) ${masterVolume}%, rgb(255 255 255 / 0.1) 100%)`
          }}
          title="Master voice volume"
        />
        <span className="text-[10px] font-mono text-paper/50 w-9 text-right select-none leading-none">
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
              roomPlaybackState={roomPlaybackState}
              activeMenu={activeMenu}
              toggleMenu={toggleMenu}
              localState={localStates[member.userId]}
              onUpdateLocalState={(updates) => updateLocalState(member.userId, updates)}
              setControlLock={setControlLock}
              isActiveSpeaker={isActiveSpeaker}
            />
          );
        })}
      </div>

      <PartyControls
        isJoined={isJoined}
        isMicMuted={isMicMuted}
        updatePartyState={updatePartyState}
        onJoin={joinVoice}
      />
    </div>
  );
};
