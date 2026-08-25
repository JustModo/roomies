import { useCallback, useEffect, useRef, useState } from 'react';

export interface AudioDeviceInfo {
  deviceId: string;
  label: string;
}

export interface UseAudioDevicesResult {
  inputs: AudioDeviceInfo[];
  outputs: AudioDeviceInfo[];
  refresh: () => Promise<void>;
  /** Whether this browser can redirect audio output to a chosen device (AudioContext.setSinkId). */
  outputSelectionSupported: boolean;
}

const isSetSinkIdSupported = (): boolean =>
  typeof window !== 'undefined' &&
  typeof AudioContext !== 'undefined' &&
  typeof (AudioContext.prototype as unknown as { setSinkId?: unknown }).setSinkId === 'function';

// Filter out synthetic "default" and "communications" entries to avoid duplicate labels.
const isSyntheticDefaultDevice = (deviceId: string): boolean =>
  deviceId === 'default' || deviceId === 'communications';

/** Enumerates audio input/output devices and updates automatically on device change. */
export function useAudioDevices(): UseAudioDevicesResult {
  const [inputs, setInputs] = useState<AudioDeviceInfo[]>([]);
  const [outputs, setOutputs] = useState<AudioDeviceInfo[]>([]);
  const isMounted = useRef(true);

  const refresh = useCallback(async () => {
    if (!navigator.mediaDevices?.enumerateDevices) return;
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      if (!isMounted.current) return;

      setInputs(
        devices
          .filter((d) => d.kind === 'audioinput' && !isSyntheticDefaultDevice(d.deviceId))
          .map((d, i) => ({ deviceId: d.deviceId, label: d.label || `Microphone ${i + 1}` })),
      );
      setOutputs(
        devices
          .filter((d) => d.kind === 'audiooutput' && !isSyntheticDefaultDevice(d.deviceId))
          .map((d, i) => ({ deviceId: d.deviceId, label: d.label || `Speaker ${i + 1}` })),
      );
    } catch (e) {
      console.warn('[useAudioDevices] Failed to enumerate devices:', e);
    }
  }, []);

  useEffect(() => {
    isMounted.current = true;
    void refresh();

    const mediaDevices = navigator.mediaDevices;
    mediaDevices?.addEventListener?.('devicechange', refresh);
    return () => {
      isMounted.current = false;
      mediaDevices?.removeEventListener?.('devicechange', refresh);
    };
  }, [refresh]);

  return { inputs, outputs, refresh, outputSelectionSupported: isSetSinkIdSupported() };
}
