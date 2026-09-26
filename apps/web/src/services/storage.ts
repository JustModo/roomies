export const KEYS = {
  chatSound: 'chat_sound_enabled',
  chatBrowserNotifications: 'chat_browser_notifications_enabled',
  chatEmojiMuted: 'chat_emoji_muted',
  chatEmojiPicker: 'chat_emoji_picker',
  chatHistory: 'chat_history:/room',
  chatKnownUsernames: 'chat_known_usernames:/room',
  voiceInputDevice: 'roomies_voice_input_device',
  voiceOutputDevice: 'roomies_voice_output_device',
  voiceMasterVolume: 'roomies_voice_master_volume',
  quality: 'roomies_quality',
  homeScreenHint: 'roomies_home_screen_hint',
  audioTrack: (mediaId: string) => `roomies_audio_${mediaId}`,
  subtitleTrack: (mediaId: string) => `roomies_subtitle_${mediaId}`,
  subtitleOffset: (mediaId: string) => `roomies_subtitle_offset_${mediaId}`,
  subtitleFontScale: (mediaId: string) => `roomies_subtitle_font_scale_${mediaId}`,
} as const;

export interface AppStorage {
  get(key: string): string | null;
  set(key: string, value: string | null): void;
  getJson<T>(key: string, fallback: T, isValid?: (value: unknown) => boolean): T;
  setJson(key: string, value: unknown): void;
}

export function createStorage(backend: Storage | undefined): AppStorage {
  const get = (key: string) => {
    try {
      return backend?.getItem(key) ?? null;
    } catch {
      return null;
    }
  };

  const set = (key: string, value: string | null) => {
    try {
      if (value === null) backend?.removeItem(key);
      else backend?.setItem(key, value);
    } catch {
      return;
    }
  };

  return {
    get,
    set,
    getJson: <T,>(key: string, fallback: T, isValid?: (value: unknown) => boolean): T => {
      const raw = get(key);
      if (raw === null) return fallback;
      try {
        const parsed: unknown = JSON.parse(raw);
        return !isValid || isValid(parsed) ? (parsed as T) : fallback;
      } catch {
        return fallback;
      }
    },
    setJson: (key, value) => set(key, JSON.stringify(value)),
  };
}
