import type { AudioTrackInfo, MediaInfo, MemberState, OutgoingSocketMessage, PlaybackState, RoomState, SubtitleTrack } from '@roomies/contracts';

export type RoomInfo = Omit<RoomState, 'playback'>;

export interface RoomSyncState {
  room: RoomInfo | null;
  playback: PlaybackState | null;
  mediaInfo: MediaInfo | null;
}

export const INITIAL_ROOM_STATE: RoomSyncState = { room: null, playback: null, mediaInfo: null };

interface MediaSource {
  mediaFileId: string;
  title: string;
  hlsUrl: string;
  duration?: number;
  transcodeOffset?: number;
  subtitles?: SubtitleTrack[];
  audioTracks?: AudioTrackInfo[];
}

export function nextMediaInfo(prev: MediaInfo | null, next: MediaSource, keepOwnSource: boolean): MediaInfo {
  const isDifferentMedia = prev?.mediaFileId !== next.mediaFileId;
  const kept = keepOwnSource && !isDifferentMedia ? prev : null;
  const transcodeOffset = kept ? kept.transcodeOffset ?? 0 : next.transcodeOffset || 0;
  const needsReinit = isDifferentMedia || prev?.transcodeOffset !== transcodeOffset;
  return {
    mediaFileId: next.mediaFileId,
    title: next.title,
    hlsUrl: kept ? kept.hlsUrl : next.hlsUrl,
    duration: next.duration,
    seekKey: (prev?.seekKey ?? 0) + (needsReinit ? 1 : 0),
    transcodeOffset,
    subtitles: next.subtitles || [],
    audioTracks: next.audioTracks || [],
  };
}

const withoutMedia = (playback: PlaybackState): PlaybackState => ({ ...playback, state: 'waiting' });

const updateMembers = (state: RoomSyncState, update: (members: MemberState[]) => MemberState[]): RoomSyncState =>
  state.room ? { ...state, room: { ...state.room, members: update(state.room.members) } } : state;

export function roomReducer(state: RoomSyncState, msg: OutgoingSocketMessage, isAsync: boolean): RoomSyncState {
  switch (msg.event) {
    case 'room.state': {
      const { playback, ...room } = msg.payload.room;
      return {
        room,
        playback: room.mediaId ? playback : withoutMedia(playback),
        mediaInfo:
          room.mediaId && room.hlsUrl
            ? nextMediaInfo(
                state.mediaInfo,
                {
                  mediaFileId: room.mediaId,
                  title: room.mediaTitle || '',
                  hlsUrl: room.hlsUrl,
                  duration: room.duration,
                  transcodeOffset: room.transcodeOffset,
                  subtitles: room.subtitles,
                  audioTracks: room.audioTracks,
                },
                isAsync,
              )
            : null,
      };
    }
    case 'playback.state': {
      if (!state.room) return state;
      const playback = { ...msg.payload };
      return { ...state, playback: state.room.mediaId ? playback : withoutMedia(playback) };
    }
    case 'media.changed': {
      const media = msg.payload;
      if (media.mediaFileId && media.hlsUrl) {
        return { ...state, mediaInfo: nextMediaInfo(state.mediaInfo, media, isAsync && media.sessionScope !== 'user') };
      }
      if (!state.room) return { ...state, mediaInfo: null };
      const { mediaId, mediaTitle, hlsUrl, duration, transcodeOffset, subtitles, audioTracks, ...room } = state.room;
      return { room, playback: state.playback && withoutMedia(state.playback), mediaInfo: null };
    }
    case 'user.status_changed': {
      const { userId, status, pingQuality } = msg.payload;
      return updateMembers(state, (members) =>
        members.map((m) => (m.userId === userId ? { ...m, status, pingQuality: pingQuality ?? m.pingQuality } : m)),
      );
    }
    case 'user.left':
      return updateMembers(state, (members) => members.filter((m) => m.userId !== msg.payload.userId));
    case 'party.updated':
      return updateMembers(state, (members) => members.map((m) => (m.userId === msg.payload.userId ? { ...m, party: msg.payload.party } : m)));
    default:
      return state;
  }
}
