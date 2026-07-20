import { ReactNode } from 'react';
import { MediaInfo, RoomState, SyncStatus } from '../../hooks/useRoomSync';

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
  onSeek: (position: number, forceNewOffset?: boolean) => void;
  onSetRate: (rate: number) => void;
  onStatusChange: (status: SyncStatus) => void;
  onReportTime: (time: number) => void;
  onReportResolution?: (resolution: string) => void;
  showChat?: boolean;
  onToggleChat?: () => void;
  isFullscreen?: boolean;
  isAsyncMode: boolean;
  onToggleAsync?: () => void;
  allowAsyncMode?: boolean;
  userId?: string;
  isLockedByAdmin?: boolean;
  children?: ReactNode;
}
