import { ReactNode } from 'react';
import { MediaInfo, RoomState } from '../../hooks/useRoomSync';

export interface BufferedRange {
  start: number;
  end: number;
}

export interface VideoPlayerProps {
  mediaInfo: MediaInfo | null;
  seekKey?: number;
  roomPlaybackState?: RoomState['playback'];
  localTime: number;
  localCorrectionRate?: number | null;
  syncSeekTrigger?: number;
  syncSeekPosition?: number;
  onPlay: () => void;
  onPause: () => void;
  onSeek: (position: number) => void;
  onSetRate: (rate: number) => void;
  onStatusChange: (status: 'ready' | 'buffering') => void;
  showChat?: boolean;
  onToggleChat?: () => void;
  children?: ReactNode;
}
