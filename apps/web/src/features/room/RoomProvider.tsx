import { createContext, useContext, useEffect, useMemo, useState, ReactNode } from 'react';
import { IncomingSocketMessage, MemberState, OutgoingSocketMessage } from '@roomies/contracts';
import { createStore, Store, useStoreValue } from '../../lib/store';
import { useAuth } from '../auth/AuthContext';
import { INITIAL_ROOM_STATE, RoomInfo, RoomSyncState, roomReducer } from './roomStore';
import { PlaybackApi, usePlaybackSync } from './usePlaybackSync';
import { useWebSocket } from './useWebSocket';

type PartyUpdate = Extract<IncomingSocketMessage, { event: 'party.update' }>['payload'];
type RoomSettingsUpdate = Extract<IncomingSocketMessage, { event: 'room.update_settings' }>['payload']['settings'];

interface RoomActions {
  updateParty: (updates: PartyUpdate) => void;
  setControlLock: (userId: string, locked: boolean) => void;
  updateSettings: (settings: RoomSettingsUpdate) => void;
  forceResume: () => void;
  leave: () => void;
}

interface RoomConnection {
  isConnected: boolean;
  send: (message: IncomingSocketMessage) => void;
  subscribe: (handler: (message: OutgoingSocketMessage) => void) => () => void;
  actions: RoomActions;
}

const RoomConnectionContext = createContext<RoomConnection | null>(null);
const RoomStoreContext = createContext<Store<RoomSyncState> | null>(null);
const PlaybackContext = createContext<PlaybackApi | null>(null);

export function RoomProvider({ children }: { children: ReactNode }) {
  const { endSession } = useAuth();
  const { isConnected, authError, sendMessage: send, addMessageHandler: subscribe } = useWebSocket();
  const [store] = useState(() => createStore(INITIAL_ROOM_STATE));
  const { api: playback, handleMessage, isAsyncRef } = usePlaybackSync({ send, store, isConnected });

  useEffect(
    () =>
      subscribe((msg) => {
        const prev = store.get();
        store.set(roomReducer(prev, msg, isAsyncRef.current));
        handleMessage(msg, prev);
      }),
    [subscribe, store, handleMessage, isAsyncRef],
  );

  useEffect(() => {
    if (!authError) return;
    endSession(authError === 'kicked' || authError === 'account_deleted' ? authError : 'disconnected');
  }, [authError, endSession]);

  const connection = useMemo<RoomConnection>(
    () => ({
      isConnected,
      send,
      subscribe,
      actions: {
        updateParty: (updates) => send({ event: 'party.update', payload: updates }),
        setControlLock: (userId, locked) => send({ event: 'room.set_control_lock', payload: { userId, locked } }),
        updateSettings: (settings) => send({ event: 'room.update_settings', payload: { settings } }),
        forceResume: () => send({ event: 'sync.force_resume', payload: {} }),
        leave: () => send({ event: 'room.leave', payload: {} }),
      },
    }),
    [isConnected, send, subscribe],
  );

  return (
    <RoomConnectionContext.Provider value={connection}>
      <RoomStoreContext.Provider value={store}>
        <PlaybackContext.Provider value={playback}>{children}</PlaybackContext.Provider>
      </RoomStoreContext.Provider>
    </RoomConnectionContext.Provider>
  );
}

function useRequired<T>(value: T | null, name: string): T {
  if (value === null) throw new Error(`${name} must be used within a RoomProvider`);
  return value;
}

export const useRoomConnection = () => useRequired(useContext(RoomConnectionContext), 'useRoomConnection');

export const usePlayback = () => useRequired(useContext(PlaybackContext), 'usePlayback');

export function useRoomSelector<T>(select: (state: RoomSyncState) => T): T {
  return useStoreValue(useRequired(useContext(RoomStoreContext), 'useRoomSelector'), select);
}

export const useRoomInfo = (): RoomInfo | null => useRoomSelector((s) => s.room);

export const useMediaInfo = () => useRoomSelector((s) => s.mediaInfo);

export function useMe(): MemberState | null {
  const { user } = useAuth();
  const room = useRoomInfo();
  return useMemo(() => room?.members.find((m) => m.userId === user?.id) ?? null, [room, user?.id]);
}
