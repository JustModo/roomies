import { createContext, useCallback, useContext, useMemo, useState, ReactNode } from 'react';
import { useServices } from '../../app/ServicesProvider';
import { KEYS } from '../../services/storage';

export const DEFAULT_EMOJI_PICKER = ['👍', '❤️', '😂', '😮', '😢', '😡'];

const isEmojiPicker = (value: unknown) =>
  Array.isArray(value) && value.length === DEFAULT_EMOJI_PICKER.length && value.every((e) => typeof e === 'string');

interface Prefs {
  soundEnabled: boolean;
  setSoundEnabled: (enabled: boolean) => void;
  browserNotificationsEnabled: boolean;
  setBrowserNotificationsEnabled: (enabled: boolean) => void;
  emojiMuted: boolean;
  setEmojiMuted: (muted: boolean) => void;
  emojiPicker: string[];
  setEmojiPicker: (picker: string[]) => void;
}

const PrefsContext = createContext<Prefs | null>(null);

function usePersistentPref<T>(key: string, fallback: T, isValid?: (value: unknown) => boolean) {
  const { storage } = useServices();
  const [value, setValue] = useState<T>(() => storage.getJson(key, fallback, isValid));
  const update = useCallback(
    (next: T) => {
      storage.setJson(key, next);
      setValue(next);
    },
    [storage, key],
  );
  return [value, update] as const;
}

export function PrefsProvider({ children }: { children: ReactNode }) {
  const [soundEnabled, setSoundEnabled] = usePersistentPref(KEYS.chatSound, true);
  const [browserNotificationsEnabled, setBrowserNotificationsEnabled] = usePersistentPref(KEYS.chatBrowserNotifications, true);
  const [emojiMuted, setEmojiMuted] = usePersistentPref(KEYS.chatEmojiMuted, false);
  const [emojiPicker, setEmojiPicker] = usePersistentPref(KEYS.chatEmojiPicker, DEFAULT_EMOJI_PICKER, isEmojiPicker);

  const value = useMemo(
    () => ({
      soundEnabled,
      setSoundEnabled,
      browserNotificationsEnabled,
      setBrowserNotificationsEnabled,
      emojiMuted,
      setEmojiMuted,
      emojiPicker,
      setEmojiPicker,
    }),
    [soundEnabled, setSoundEnabled, browserNotificationsEnabled, setBrowserNotificationsEnabled, emojiMuted, setEmojiMuted, emojiPicker, setEmojiPicker],
  );

  return <PrefsContext.Provider value={value}>{children}</PrefsContext.Provider>;
}

export function usePrefs() {
  const value = useContext(PrefsContext);
  if (!value) throw new Error('usePrefs must be used within a PrefsProvider');
  return value;
}
