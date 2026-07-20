import { ReactNode } from 'react';
import { MediaInfo, RoomState, SyncStatus } from '@roomies/contracts';

export interface BufferedRange {
  start: number;
  end: number;
}

/**
 * A seek command issued by the sync system. Using an object with a monotonically
 * increasing `id` instead of a bare counter eliminates stale-trigger replays:
 * `useVideoEvents` tracks the last handled id and skips duplicates.
 */
export interface SeekCommand {
  position: number;
  id: number;
}

export interface VideoPlayerProps {
  mediaInfo: MediaInfo | null;
  seekKey?: number;
  roomPlaybackState?: RoomState['playback'];
  localTime: number;
  localCorrectionRate?: number | null;
  /** Replaces the old syncSeekTrigger + syncSeekPosition pair. */
  seekCommand?: SeekCommand | null;
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
