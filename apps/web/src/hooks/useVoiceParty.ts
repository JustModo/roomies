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

  // Reconciliation Engine for Mobile Drops
  useEffect(() => {
    const reconcile = () => {
      if (!isJoined || !roomState || !userId || !managerRef.current) return;

      // 1. Check if mic was killed by OS backgrounding and revive it
      managerRef.current.join().catch(e => console.warn('Failed to revive mic', e));

      // 2. Determine who should be connected
      const currentPartyMembers = roomState.members
        .filter(m => m.party.isJoined && m.userId !== userId)
        .map(m => m.userId);

      const connectedPeers = managerRef.current.getConnectedPeers();

      const newMembers = currentPartyMembers.filter(id => !connectedPeers.includes(id));
      const leftMembers = connectedPeers.filter(id => !currentPartyMembers.includes(id));

      newMembers.forEach(peerId => {
        // Connect to peer (deterministic initiator logic to prevent collision: higher ID initiates)
        const isInitiator = userId > peerId;
        managerRef.current?.connectToPeer(peerId, isInitiator);
      });

      leftMembers.forEach(peerId => {
        managerRef.current?.removePeer(peerId);
      });
    };

    // Run reconciliation on every room state change
    reconcile();

    // Run reconciliation when OS returns app to foreground
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        reconcile();
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);

    // Run reconciliation if a socket drops unexpectedly
    if (managerRef.current) {
        managerRef.current.onPeerDisconnected = () => {
            // Reconcile on next tick to avoid synchronous loop issues
            setTimeout(reconcile, 0);
        };
    }

    return () => {
        document.removeEventListener('visibilitychange', handleVisibility);
        if (managerRef.current) {
            managerRef.current.onPeerDisconnected = undefined;
        }
    };
  }, [roomState?.members, isJoined, userId]);

  return {
    joinVoice,
    toggleMute,
    activeStreams
  };
}
