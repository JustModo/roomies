import { describe, it, expect } from 'vitest';
import type { OutgoingSocketMessage, RoomState } from '@roomies/contracts';
import { INITIAL_ROOM_STATE, nextMediaInfo, roomReducer } from '@roomies/web/src/features/room/roomStore';

const playback = { state: 'playing' as const, intendedState: 'playing' as const, anchorPosition: 10, anchorTime: 1000, playbackRate: 1 };
const member = { userId: 'u1', username: 'ann', status: 'ready' as const, position: 0, pingQuality: 0, controlsLocked: false, party: { isJoined: false, micMuted: true, videoMuted: true } };

const room = (overrides: Partial<RoomState> = {}): RoomState => ({
  settings: { allowAsyncMode: true },
  mediaId: 'm1',
  mediaTitle: 'Film',
  hlsUrl: '/hls/m1/sync/master.m3u8',
  duration: 600,
  transcodeOffset: 0,
  subtitles: [],
  audioTracks: [],
  playback,
  members: [member],
  ...overrides,
}) as RoomState;

const roomStateMsg = (r: RoomState): OutgoingSocketMessage => ({ event: 'room.state', payload: { room: r } });

describe('nextMediaInfo', () => {
  const source = { mediaFileId: 'm1', title: 'Film', hlsUrl: '/sync.m3u8', transcodeOffset: 120 };

  it('bumps seekKey when the offset or media changes', () => {
    const first = nextMediaInfo(null, source, false);
    expect(first.seekKey).toBe(1);
    expect(nextMediaInfo(first, source, false).seekKey).toBe(1);
    expect(nextMediaInfo(first, { ...source, transcodeOffset: 240 }, false).seekKey).toBe(2);
    expect(nextMediaInfo(first, { ...source, mediaFileId: 'm2' }, false).seekKey).toBe(2);
  });

  it('keeps an async viewer on their own source for the same media', () => {
    const own = nextMediaInfo(null, { ...source, hlsUrl: '/async.m3u8', transcodeOffset: 300 }, false);
    const next = nextMediaInfo(own, source, true);
    expect(next.hlsUrl).toBe('/async.m3u8');
    expect(next.transcodeOffset).toBe(300);
    expect(next.seekKey).toBe(own.seekKey);
  });

  it('switches an async viewer when the media itself changes', () => {
    const own = nextMediaInfo(null, { ...source, hlsUrl: '/async.m3u8', transcodeOffset: 300 }, false);
    const next = nextMediaInfo(own, { ...source, mediaFileId: 'm2' }, true);
    expect(next.hlsUrl).toBe('/sync.m3u8');
    expect(next.transcodeOffset).toBe(120);
  });
});

describe('roomReducer', () => {
  it('splits room.state into room, playback and media info', () => {
    const state = roomReducer(INITIAL_ROOM_STATE, roomStateMsg(room()), false);
    expect(state.room?.members).toHaveLength(1);
    expect(state.room).not.toHaveProperty('playback');
    expect(state.playback?.state).toBe('playing');
    expect(state.mediaInfo?.mediaFileId).toBe('m1');
  });

  it('marks playback as waiting when no media is loaded', () => {
    const state = roomReducer(INITIAL_ROOM_STATE, roomStateMsg(room({ mediaId: undefined, hlsUrl: undefined })), false);
    expect(state.playback?.state).toBe('waiting');
    expect(state.mediaInfo).toBeNull();
  });

  it('keeps room identity stable across playback updates', () => {
    const joined = roomReducer(INITIAL_ROOM_STATE, roomStateMsg(room()), false);
    const paused = roomReducer(joined, { event: 'playback.state', payload: { ...playback, state: 'paused', action: 'pause' } }, false);
    expect(paused.room).toBe(joined.room);
    expect(paused.playback?.state).toBe('paused');
  });

  it('ignores playback updates before the room is known', () => {
    expect(roomReducer(INITIAL_ROOM_STATE, { event: 'playback.state', payload: playback }, false)).toBe(INITIAL_ROOM_STATE);
  });

  it('clears media and waits when media is stopped', () => {
    const joined = roomReducer(INITIAL_ROOM_STATE, roomStateMsg(room()), false);
    const stopped = roomReducer(joined, { event: 'media.changed', payload: { mediaFileId: '', title: '', hlsUrl: '' } }, false);
    expect(stopped.mediaInfo).toBeNull();
    expect(stopped.room?.mediaId).toBeUndefined();
    expect(stopped.playback?.state).toBe('waiting');
  });

  it('updates, removes and re-parties members', () => {
    let state = roomReducer(INITIAL_ROOM_STATE, roomStateMsg(room()), false);
    state = roomReducer(state, { event: 'user.status_changed', payload: { userId: 'u1', status: 'async' } }, false);
    expect(state.room?.members[0].status).toBe('async');
    state = roomReducer(state, { event: 'party.updated', payload: { userId: 'u1', party: { isJoined: true, micMuted: false, videoMuted: true } } }, false);
    expect(state.room?.members[0].party.isJoined).toBe(true);
    state = roomReducer(state, { event: 'user.left', payload: { userId: 'u1', username: 'ann' } }, false);
    expect(state.room?.members).toHaveLength(0);
  });
});
