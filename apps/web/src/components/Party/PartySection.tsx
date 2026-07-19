import React, { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useActiveMenu } from '../../hooks/useActiveMenu';
import { RoomState } from '../../hooks/useRoomSync';
import { PartyMember } from './PartyMember';
import { PartyControls } from './PartyControls';
import { useVoiceParty } from '../../hooks/useVoiceParty';

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

  const [localStates, setLocalStates] = useState<Record<string, LocalMemberState>>({});

  const updateLocalState = (userId: string, updates: Partial<LocalMemberState>) => {
    setLocalStates(prev => ({
      ...prev,
      [userId]: {
        ...(prev[userId] || { audioMuted: false, volume: 100 }),
        ...updates,
      }
    }));
  };

  const currentUserMember = members.find(m => m.userId === user?.id);
  const isJoined = currentUserMember?.party.isJoined ?? false;
  const isMicMuted = currentUserMember?.party.micMuted ?? true;
  const isVideoMuted = currentUserMember?.party.videoMuted ?? true;

  const { joinVoice, setVolume, setPeerMuted } = useVoiceParty({
    isJoined,
    isMicMuted,
  });

  const handleLocalStateUpdate = (userId: string, updates: Partial<LocalMemberState>) => {
    updateLocalState(userId, updates);
    if (updates.volume !== undefined) setVolume(userId, updates.volume);
    if (updates.audioMuted !== undefined) setPeerMuted(userId, updates.audioMuted);
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
        }).map((member) => (
          <PartyMember
            key={member.userId}
            member={member}
            user={user}
            roomPlaybackState={roomPlaybackState}
            activeMenu={activeMenu}
            toggleMenu={toggleMenu}
            localState={localStates[member.userId]}
            onUpdateLocalState={(updates) => handleLocalStateUpdate(member.userId, updates)}
            setControlLock={setControlLock}
          />
        ))}
      </div>

      <PartyControls
        isJoined={isJoined}
        isMicMuted={isMicMuted}
        isVideoMuted={isVideoMuted}
        updatePartyState={updatePartyState}
        onJoin={joinVoice}
      />
    </div>
  );
};
