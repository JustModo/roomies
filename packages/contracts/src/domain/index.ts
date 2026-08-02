import { OutgoingSocketMessage } from '../socket';
import { SubtitleTrack } from '../api';

export type RoomState = Extract<OutgoingSocketMessage, { event: 'room.state' }>['payload']['room'];
export type MemberState = RoomState['members'][0];
export type RoomSettings = RoomState['settings'];
export type PlaybackState = RoomState['playback'];
export type SyncStatus = MemberState['status'];

export interface MediaInfo {
  mediaFileId: string;
  title: string;
  hlsUrl: string;
  duration?: number;
  seekKey?: number;
  transcodeOffset: number;
  subtitles: SubtitleTrack[];
}

export interface VoicePeerState {
  userId: string;
  username: string;
  isJoined: boolean;
  micMuted: boolean;
  videoMuted: boolean;
}
