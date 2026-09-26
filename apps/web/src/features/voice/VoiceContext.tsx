import React, { createContext, useContext, useEffect, useLayoutEffect, useRef, useCallback, useMemo, useState } from 'react';
import type { AudioRelay } from '@roomies/voice';
import { useServices } from '../../app/ServicesProvider';
import { KEYS } from '../../services/storage';
import { useReconnectingSocket, SocketControl } from '../../services/useReconnectingSocket';
import { useAuth } from '../auth/AuthContext';
import { useMe } from '../room/RoomProvider';
import { useAudioDevices, AudioDeviceInfo } from './useAudioDevices';

export interface LocalMemberState {
  audioMuted: boolean;
  volume: number;
}

interface VoiceContextValue {
  joinVoice: () => Promise<void>;
  masterVolume: number;
  setMasterVolume: (volume: number) => void;
  localStates: Record<string, LocalMemberState>;
  updateLocalState: (userId: string, updates: Partial<LocalMemberState>) => void;
  inputDevices: AudioDeviceInfo[];
  outputDevices: AudioDeviceInfo[];
  selectedInputId: string | undefined;
  selectedOutputId: string | undefined;
  setInputDevice: (deviceId: string | undefined) => Promise<void>;
  setOutputDevice: (deviceId: string | undefined) => Promise<void>;
  outputSelectionSupported: boolean;
  notice: string | null;
  dismissNotice: () => void;
}

const VoiceContext = createContext<VoiceContextValue | null>(null);
const SpeakersContext = createContext<Set<string>>(new Set());

type VoiceControlMessage =
  | { event: 'session_map'; payload: Record<string, number> }
  | { event: 'peer_joined'; payload: { userId: string; sessionId: number } }
  | { event: 'peer_left'; payload: { userId: string } }
  | { event: 'ping' }
  | { event: 'error'; payload: string };

interface AudioSessionNavigator {
  audioSession?: { type: string };
}

const setAudioSessionType = (type: 'play-and-record' | 'auto') => {
  const session = (navigator as Navigator & AudioSessionNavigator).audioSession;
  if (session) session.type = type;
};

const VOICE_CONTROL = {
  join: 'join',
  leave: 'leave',
  pong: 'pong',
} as const;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const isSessionMap = (payload: unknown): payload is Record<string, number> => {
  if (!isRecord(payload)) return false;
  return Object.values(payload).every((value) => typeof value === 'number');
};

const parseVoiceControlMessage = (raw: string): VoiceControlMessage | null => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }

  if (!isRecord(parsed) || typeof parsed.event !== 'string') return null;

  switch (parsed.event) {
    case 'session_map':
      return isSessionMap(parsed.payload)
        ? { event: parsed.event, payload: parsed.payload }
        : null;
    case 'peer_joined':
      return isRecord(parsed.payload) &&
        typeof parsed.payload.userId === 'string' &&
        typeof parsed.payload.sessionId === 'number'
        ? {
          event: parsed.event,
          payload: {
            userId: parsed.payload.userId,
            sessionId: parsed.payload.sessionId,
          },
        }
        : null;
    case 'peer_left':
      return isRecord(parsed.payload) && typeof parsed.payload.userId === 'string'
        ? { event: parsed.event, payload: { userId: parsed.payload.userId } }
        : null;
    case 'ping':
      return { event: parsed.event };
    case 'error':
      return typeof parsed.payload === 'string'
        ? { event: parsed.event, payload: parsed.payload }
        : null;
    default:
      return null;
  }
};

/** Maps a getUserMedia rejection to a friendly, actionable message. */
const describeMicError = (e: unknown): Error => {
  if (e instanceof DOMException) {
    switch (e.name) {
      case 'NotAllowedError':
        return new Error('Microphone access was denied. Allow microphone access for this site in your browser settings and try again.');
      case 'NotFoundError':
        return new Error('No microphone was found. Connect a microphone and try again.');
      case 'NotReadableError':
        return new Error('Your microphone is already in use by another application.');
      case 'OverconstrainedError':
        return new Error('The selected microphone is no longer available.');
      default:
        return new Error(e.message || 'Failed to access microphone.');
    }
  }
  return e instanceof Error ? e : new Error('Failed to access microphone.');
};

export function VoiceProvider({ children }: { children: React.ReactNode }) {
  const { token } = useAuth();
  const { storage, createAudioRelay } = useServices();
  const me = useMe();
  const isJoined = me?.party.isJoined ?? false;
  const isMicMuted = me?.party.micMuted ?? true;

  const relayRef = useRef<AudioRelay | null>(null);
  const relayReadyRef = useRef<Promise<AudioRelay> | null>(null);
  const userToSessionRef = useRef<Map<string, number>>(new Map());
  const sessionToUserRef = useRef<Map<number, string>>(new Map());

  const stateRef = useRef({ isJoined, isMicMuted });
  useEffect(() => {
    stateRef.current = { isJoined, isMicMuted };
  }, [isJoined, isMicMuted]);

  const [localStates, setLocalStates] = useState<Record<string, LocalMemberState>>({});
  const [masterVolume, setMasterVolumeState] = useState(() => storage.getJson(KEYS.voiceMasterVolume, 100, Number.isFinite));
  const { inputs, outputs, refresh: refreshDevices, outputSelectionSupported } = useAudioDevices();
  const [selectedInputId, setSelectedInputId] = useState<string | undefined>(() => storage.get(KEYS.voiceInputDevice) ?? undefined);
  const [selectedOutputId, setSelectedOutputId] = useState<string | undefined>(() => storage.get(KEYS.voiceOutputDevice) ?? undefined);
  const [notice, setNotice] = useState<string | null>(null);
  const dismissNotice = useCallback(() => setNotice(null), []);
  const [activeSpeakers, setActiveSpeakers] = useState<Set<string>>(() => new Set());

  const selectionRef = useRef({ selectedInputId, selectedOutputId });
  useEffect(() => {
    selectionRef.current = { selectedInputId, selectedOutputId };
  }, [selectedInputId, selectedOutputId]);

  const fallbackToDefaultInput = useCallback(() => {
    setSelectedInputId(undefined);
    storage.set(KEYS.voiceInputDevice, null);
    if (stateRef.current.isJoined) relayRef.current?.switchMic(undefined).catch(() => {});
    void refreshDevices();
  }, [storage, refreshDevices]);

  const fallbackToDefaultOutput = useCallback(() => {
    setSelectedOutputId(undefined);
    storage.set(KEYS.voiceOutputDevice, null);
    void relayRef.current?.setOutputDevice(undefined);
  }, [storage]);

  useEffect(() => {
    if (selectedInputId && inputs.length > 0 && !inputs.some((d) => d.deviceId === selectedInputId)) fallbackToDefaultInput();
  }, [inputs, selectedInputId, fallbackToDefaultInput]);

  useEffect(() => {
    if (selectedOutputId && outputs.length > 0 && !outputs.some((d) => d.deviceId === selectedOutputId)) fallbackToDefaultOutput();
  }, [outputs, selectedOutputId, fallbackToDefaultOutput]);

  const setInputDevice = useCallback(
    async (deviceId: string | undefined) => {
      setSelectedInputId(deviceId);
      storage.set(KEYS.voiceInputDevice, deviceId ?? null);
      if (!stateRef.current.isJoined || !relayRef.current) return;
      try {
        const { usedFallback } = await relayRef.current.switchMic(deviceId);
        if (usedFallback) fallbackToDefaultInput();
      } catch (e) {
        setNotice(describeMicError(e).message);
      }
    },
    [storage, fallbackToDefaultInput],
  );

  const setOutputDevice = useCallback(
    async (deviceId: string | undefined) => {
      setSelectedOutputId(deviceId);
      storage.set(KEYS.voiceOutputDevice, deviceId ?? null);
      await relayRef.current?.setOutputDevice(deviceId);
    },
    [storage],
  );

  const updateLocalState = useCallback((userId: string, updates: Partial<LocalMemberState>) => {
    if (updates.volume !== undefined) relayRef.current?.setVolume(userId, updates.volume);
    if (updates.audioMuted !== undefined) relayRef.current?.setPeerMuted(userId, updates.audioMuted);
    setLocalStates((prev) => ({ ...prev, [userId]: { ...(prev[userId] ?? { audioMuted: false, volume: 100 }), ...updates } }));
  }, []);

  const onMessage = useCallback((event: MessageEvent, control: SocketControl) => {
    if (event.data instanceof ArrayBuffer) {
      if (event.data.byteLength <= 2) return;
      const sessionId = new DataView(event.data).getUint16(0);
      const userId = sessionToUserRef.current.get(sessionId);
      if (userId) relayRef.current?.scheduleChunk(userId, new Uint8Array(event.data, 2));
      return;
    }
    if (typeof event.data !== 'string') return;
    const msg = parseVoiceControlMessage(event.data);
    if (!msg) return;
    switch (msg.event) {
      case 'session_map':
        userToSessionRef.current.clear();
        sessionToUserRef.current.clear();
        for (const [uid, sessionId] of Object.entries(msg.payload)) {
          userToSessionRef.current.set(uid, sessionId);
          sessionToUserRef.current.set(sessionId, uid);
        }
        return;
      case 'peer_joined':
        userToSessionRef.current.set(msg.payload.userId, msg.payload.sessionId);
        sessionToUserRef.current.set(msg.payload.sessionId, msg.payload.userId);
        return;
      case 'peer_left': {
        const sessionId = userToSessionRef.current.get(msg.payload.userId);
        if (sessionId === undefined) return;
        relayRef.current?.removePeer(msg.payload.userId);
        userToSessionRef.current.delete(msg.payload.userId);
        sessionToUserRef.current.delete(sessionId);
        return;
      }
      case 'ping':
        sendRef.current(JSON.stringify({ event: VOICE_CONTROL.pong }));
        return;
      case 'error':
        if (msg.payload === 'Unauthorized' || msg.payload === 'Session replaced by a new connection') control.halt();
        return;
    }
  }, []);

  const { send } = useReconnectingSocket({
    path: '/ws/voice',
    token,
    enabled: isJoined,
    binaryType: 'arraybuffer',
    onOpen: (socket) => socket.send(JSON.stringify({ event: VOICE_CONTROL.join })),
    onMessage,
    onDispose: (socket) => socket.send(JSON.stringify({ event: VOICE_CONTROL.leave })),
  });
  const sendRef = useRef(send);
  useLayoutEffect(() => {
    sendRef.current = send;
  }, [send]);

  const relaySetupRef = useRef({ masterVolume, fallbackToDefaultInput });
  useLayoutEffect(() => {
    relaySetupRef.current = { masterVolume, fallbackToDefaultInput };
  });

  useEffect(() => {
    let disposed = false;
    const ready = createAudioRelay().then((relay) => {
      if (disposed) {
        relay.leave();
        return relay;
      }
      relay.onInputDeviceEnded = () => relaySetupRef.current.fallbackToDefaultInput();
      relay.onActiveSpeakersChanged = (speakers: Set<string>) => setActiveSpeakers(speakers);
      relay.onChunk = (chunk: Uint8Array) => sendRef.current(chunk);
      relay.setMasterVolume(relaySetupRef.current.masterVolume);
      relayRef.current = relay;
      return relay;
    });
    relayReadyRef.current = ready;
    return () => {
      disposed = true;
      relayRef.current?.leave();
      relayRef.current = null;
    };
  }, [createAudioRelay]);

  useEffect(() => {
    relayRef.current?.setMuted(isMicMuted);
  }, [isMicMuted]);

  useEffect(() => {
    if (isJoined) return;
    relayRef.current?.leave();
    userToSessionRef.current.clear();
    sessionToUserRef.current.clear();
    setAudioSessionType('auto');
  }, [isJoined]);

  const joinVoice = useCallback(async () => {
    const relay = await relayReadyRef.current;
    if (!relay || relayRef.current !== relay) return;
    setAudioSessionType('play-and-record');
    try {
      const { usedFallback } = await relay.join(selectionRef.current.selectedInputId);
      if (selectionRef.current.selectedOutputId) await relay.setOutputDevice(selectionRef.current.selectedOutputId);
      relay.setMuted(stateRef.current.isMicMuted);
      if (usedFallback) fallbackToDefaultInput();
      void refreshDevices();
    } catch (e) {
      setAudioSessionType('auto');
      throw describeMicError(e);
    }
  }, [fallbackToDefaultInput, refreshDevices]);

  const setMasterVolume = useCallback(
    (volume: number) => {
      setMasterVolumeState(volume);
      storage.setJson(KEYS.voiceMasterVolume, volume);
      relayRef.current?.setMasterVolume(volume);
    },
    [storage],
  );

  const value = useMemo<VoiceContextValue>(
    () => ({
      joinVoice,
      masterVolume,
      setMasterVolume,
      localStates,
      updateLocalState,
      inputDevices: inputs,
      outputDevices: outputs,
      selectedInputId,
      selectedOutputId,
      setInputDevice,
      setOutputDevice,
      outputSelectionSupported,
      notice,
      dismissNotice,
    }),
    [joinVoice, masterVolume, setMasterVolume, localStates, updateLocalState, inputs, outputs, selectedInputId, selectedOutputId, setInputDevice, setOutputDevice, outputSelectionSupported, notice, dismissNotice],
  );

  return (
    <VoiceContext.Provider value={value}>
      <SpeakersContext.Provider value={activeSpeakers}>{children}</SpeakersContext.Provider>
    </VoiceContext.Provider>
  );
}

export function useVoice() {
  const context = useContext(VoiceContext);
  if (!context) throw new Error('useVoice must be used within a VoiceProvider');
  return context;
}

export const useActiveSpeakers = () => useContext(SpeakersContext);
