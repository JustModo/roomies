import { useEffect, useRef, useState, useCallback } from 'react';
import { WebRTCManager, SignalPayload } from '@roomies/voice';
import { RoomState } from './useRoomSync';

interface UseVoicePartyParams {
  userId?: string;
  roomState: RoomState | null;
  addMessageHandler: (handler: (msg: any) => void) => () => void;
  sendMessage: (msg: any) => void;
  isJoined: boolean;
  isMicMuted: boolean;
}

export function useVoiceParty({ userId, roomState, addMessageHandler, sendMessage, isJoined, isMicMuted }: UseVoicePartyParams) {
  const [activeStreams, setActiveStreams] = useState<Record<string, MediaStream>>({});
  const managerRef = useRef<WebRTCManager | null>(null);

  useEffect(() => {
    if (!userId) return;
    managerRef.current = new WebRTCManager();

    managerRef.current.onSignal = (payload: SignalPayload) => {
      sendMessage({
        event: 'party.webrtc_signal',
        payload
      });
    };

    managerRef.current.onStreamAdded = (peerId: string, stream: MediaStream) => {
      setActiveStreams(prev => ({ ...prev, [peerId]: stream }));
    };

    managerRef.current.onStreamRemoved = (peerId: string) => {
      setActiveStreams(prev => {
        const next = { ...prev };
        delete next[peerId];
        return next;
      });
    };

    return () => {
      managerRef.current?.leave();
    };
  }, [userId, sendMessage]);

  useEffect(() => {
    managerRef.current?.toggleMute(isMicMuted);
  }, [isMicMuted]);

  const joinVoice = useCallback(async () => {
    if (!managerRef.current) return;
    await managerRef.current.join();
    managerRef.current.toggleMute(isMicMuted);
  }, [isMicMuted]);

  const toggleMute = useCallback((muted: boolean) => {
    managerRef.current?.toggleMute(muted);
  }, []);

  // Listen to incoming signaling messages
  useEffect(() => {
    if (!isJoined) return;
    const remove = addMessageHandler((msg) => {
      if (msg.event === 'party.webrtc_signal') {
        const { sourceUserId, signal } = msg.payload;
        managerRef.current?.handleSignal(sourceUserId, signal);
      }
    });
    return () => remove();
  }, [addMessageHandler, isJoined]);

  // Sync peers based on party members
  const prevPartyMembersRef = useRef<string[]>([]);
  
  useEffect(() => {
    if (!isJoined || !roomState || !userId) return;

    const currentPartyMembers = roomState.members
      .filter(m => m.party.isJoined && m.userId !== userId)
      .map(m => m.userId);

    const newMembers = currentPartyMembers.filter(id => !prevPartyMembersRef.current.includes(id));
    const leftMembers = prevPartyMembersRef.current.filter(id => !currentPartyMembers.includes(id));

    newMembers.forEach(peerId => {
      // Connect to peer (deterministic initiator logic to prevent collision: higher ID initiates)
      const isInitiator = userId > peerId;
      managerRef.current?.connectToPeer(peerId, isInitiator);
    });

    leftMembers.forEach(peerId => {
      managerRef.current?.removePeer(peerId);
    });

    prevPartyMembersRef.current = currentPartyMembers;
  }, [roomState?.members, isJoined, userId]);

  return {
    joinVoice,
    toggleMute,
    activeStreams
  };
}
