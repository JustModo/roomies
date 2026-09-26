import { describe, it, expect } from 'vitest';
import { KEYS, createStorage } from '@roomies/web/src/services/storage';

const memoryStorage = (): Storage => {
  const data = new Map<string, string>();
  return {
    get length() {
      return data.size;
    },
    clear: () => data.clear(),
    getItem: (k) => data.get(k) ?? null,
    key: (i) => [...data.keys()][i] ?? null,
    removeItem: (k) => void data.delete(k),
    setItem: (k, v) => void data.set(k, String(v)),
  };
};

describe('storage', () => {
  it('round-trips raw and JSON values and removes on null', () => {
    const storage = createStorage(memoryStorage());
    storage.set(KEYS.quality, '720p');
    expect(storage.get(KEYS.quality)).toBe('720p');
    storage.setJson(KEYS.chatSound, false);
    expect(storage.getJson(KEYS.chatSound, true)).toBe(false);
    storage.set(KEYS.quality, null);
    expect(storage.get(KEYS.quality)).toBeNull();
  });

  it('keeps existing key names so saved preferences survive', () => {
    expect(KEYS.audioTrack('m1')).toBe('roomies_audio_m1');
    expect(KEYS.chatEmojiMuted).toBe('chat_emoji_muted');
  });

  it('falls back on corrupt or invalid JSON and missing backends', () => {
    const backend = memoryStorage();
    backend.setItem(KEYS.chatEmojiPicker, '{broken');
    const storage = createStorage(backend);
    expect(storage.getJson(KEYS.chatEmojiPicker, ['👍'])).toEqual(['👍']);
    backend.setItem(KEYS.chatEmojiPicker, '"not-an-array"');
    expect(storage.getJson(KEYS.chatEmojiPicker, ['👍'], Array.isArray)).toEqual(['👍']);
    expect(createStorage(undefined).get(KEYS.quality)).toBeNull();
  });

  it('swallows backend errors such as Safari private mode quota', () => {
    const throwing = { ...memoryStorage(), setItem: () => { throw new Error('QuotaExceededError'); }, getItem: () => { throw new Error('SecurityError'); } } as Storage;
    const storage = createStorage(throwing);
    expect(() => storage.set(KEYS.quality, '1080p')).not.toThrow();
    expect(storage.get(KEYS.quality)).toBeNull();
  });
});
