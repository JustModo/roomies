import React from 'react';
import { Play, Pause, RotateCcw, RotateCw, Mic, MicOff, Maximize, Minimize, MessageSquare } from 'lucide-react';
import type { Level, MediaPlaylist } from 'hls.js';
import type { SubtitleTrack } from '@roomies/contracts';
import { useChatAlerts } from '../../chat/ChatContext';
import { ReactionButton } from '../../reactions/EmojiReactions';
import { nextPlaybackRate } from '../../../lib/playbackRate';
import { formatTime } from '../../../lib/time';
import { Store, useStoreValue } from '../../../lib/store';
import { BAR_EDGE_X, ICON_BTN_PADDING, ICON_PRIMARY, ICON_SECONDARY, ACTIVE_TICK, CONTROLS_GAP, TIME_PAIR_WIDTH } from '../styleTokens';
import { ControlButton } from './ControlButton';
import { SettingsMenu, SubtitleControls } from './SettingsMenu';
import { VolumeControl } from './VolumeControl';

export interface HlsControls {
  levels: Level[];
  currentLevel: number;
  onQualityChange: (index: number) => void;
  audioTracks: MediaPlaylist[];
  currentAudioTrack: number;
  onAudioTrackChange: (index: number) => void;
}

interface VideoControlsProps {
  hasMedia: boolean;
  isLocked: boolean;
  isPlaying: boolean;
  volume: number;
  setVolume: (volume: number) => void;
  timeStore: Store<number>;
  pendingSeek: number | null;
  totalDuration: number;
  onPlayPause: () => void;
  onSeekOffset: (offset: number) => void;
  playbackRate: number;
  onSetRate: (rate: number) => void;
  hls: HlsControls;
  subtitles: SubtitleTrack[];
  subs: SubtitleControls;
  showChat: boolean;
  onToggleChat?: () => void;
  isFullscreen: boolean;
  onToggleFullscreen?: () => void;
  isAsyncMode: boolean;
  onToggleAsync?: () => void;
  allowAsyncMode: boolean;
  onMenuOpenChange: (open: boolean) => void;
  isPartyJoined: boolean;
  isMicMuted: boolean;
  onToggleMic?: () => void;
  docked: boolean;
}

const identity = (time: number) => time;
const COMPACT_HIDDEN = '@max-[30rem]/player:hidden';
const TEXT_BUTTON = 'text-11 sm:text-12 lg:text-16 font-mono transition-colors px-1 lg:px-2 h-6 lg:h-8 pointer-coarse:min-h-8 pointer-coarse:min-w-8 flex items-center justify-center shrink-0 disabled:opacity-30 disabled:cursor-not-allowed';

const TimeLabel: React.FC<{ timeStore: Store<number>; pendingSeek: number | null; totalDuration: number }> = ({ timeStore, pendingSeek, totalDuration }) => {
  const time = useStoreValue(timeStore, identity);
  return (
    <span className={`hidden sm:flex font-mono text-12 lg:text-14 text-paper/70 tabular-nums whitespace-nowrap shrink-0 ${TIME_PAIR_WIDTH}`}>
      {formatTime(pendingSeek ?? time)} / {formatTime(totalDuration)}
    </span>
  );
};

export const VideoControls: React.FC<VideoControlsProps> = ({
  hasMedia,
  isLocked,
  isPlaying,
  volume,
  setVolume,
  timeStore,
  pendingSeek,
  totalDuration,
  onPlayPause,
  onSeekOffset,
  playbackRate,
  onSetRate,
  hls,
  subtitles,
  subs,
  showChat,
  onToggleChat,
  isFullscreen,
  onToggleFullscreen,
  isAsyncMode,
  onToggleAsync,
  allowAsyncMode,
  onMenuOpenChange,
  isPartyJoined,
  isMicMuted,
  onToggleMic,
  docked,
}) => {
  const { unreadCount } = useChatAlerts();
  const cycleRate = isLocked ? undefined : () => onSetRate(nextPlaybackRate(playbackRate));

  return (
    <div data-video-controls="true" className={`flex items-center justify-between ${BAR_EDGE_X} pt-0 pb-1 sm:pb-3 lg:pb-4 gap-1`}>
      <div className={`flex items-center min-w-0 ${CONTROLS_GAP}`}>
        <ControlButton disabled={isLocked} onClick={onPlayPause} title={isPlaying ? 'Pause' : 'Play'} important>
          {isPlaying ? <Pause className={ICON_PRIMARY} fill="currentColor" /> : <Play className={ICON_PRIMARY} fill="currentColor" />}
        </ControlButton>

        <div className={`flex items-center ${CONTROLS_GAP} ${COMPACT_HIDDEN}`}>
          <ControlButton disabled={isLocked} onClick={() => onSeekOffset(-10)} title="Back 10s">
            <RotateCcw className={ICON_SECONDARY} strokeWidth={1.5} />
          </ControlButton>
          <ControlButton disabled={isLocked} onClick={() => onSeekOffset(10)} title="Forward 10s">
            <RotateCw className={ICON_SECONDARY} strokeWidth={1.5} />
          </ControlButton>
        </div>

        {isPartyJoined && onToggleMic && (
          <ControlButton onClick={onToggleMic} title={isMicMuted ? 'Unmute mic (M)' : 'Mute mic (M)'}>
            {isMicMuted ? <MicOff className={`${ICON_SECONDARY} text-danger`} strokeWidth={1.5} /> : <Mic className={ICON_SECONDARY} strokeWidth={1.5} />}
          </ControlButton>
        )}

        <VolumeControl volume={volume} setVolume={setVolume} />

        <TimeLabel timeStore={timeStore} pendingSeek={pendingSeek} totalDuration={totalDuration} />
      </div>

      <div className={`flex items-center shrink-0 relative ${CONTROLS_GAP}`}>
        {hasMedia && onToggleAsync && (
          <button
            disabled={!allowAsyncMode}
            onClick={onToggleAsync}
            className={`relative ${TEXT_BUTTON} ${!isAsyncMode ? `text-accent font-medium ${ACTIVE_TICK}` : 'text-fog hover:text-paper'}`}
            title={!allowAsyncMode ? 'Async mode disabled by admin' : isAsyncMode ? 'Resync with Room' : 'Go Async Mode'}
          >
            SYNC
          </button>
        )}

        {hasMedia && (
          <button disabled={isLocked} onClick={cycleRate} className={`${TEXT_BUTTON} text-fog hover:text-paper ${COMPACT_HIDDEN}`} title="Playback speed">
            {playbackRate}x
          </button>
        )}

        {docked && <ReactionButton className={`flex items-center justify-center ${ICON_BTN_PADDING} text-fog hover:text-paper transition-colors duration-150`} />}

        {!docked && onToggleChat && (
          <ControlButton onClick={onToggleChat} active={showChat} className={`relative ${showChat ? ACTIVE_TICK : ''}`} title="Toggle chat">
            <MessageSquare className={ICON_SECONDARY} strokeWidth={1.5} />
            {unreadCount > 0 && !showChat && (
              <span className="absolute -top-1 -right-1 min-w-[14px] h-[14px] px-1 bg-accent text-11 flex items-center justify-center text-paper font-bold">
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            )}
          </ControlButton>
        )}

        {hasMedia && (
          <SettingsMenu
            levels={hls.levels}
            currentLevel={hls.currentLevel}
            onQualityChange={hls.onQualityChange}
            audioTracks={hls.audioTracks}
            currentAudioTrack={hls.currentAudioTrack}
            onAudioTrackChange={hls.onAudioTrackChange}
            subtitles={subtitles}
            subs={subs}
            playbackRate={playbackRate}
            onCycleRate={cycleRate}
            onOpenChange={onMenuOpenChange}
          />
        )}

        <ControlButton onClick={() => onToggleFullscreen?.()} title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'} important>
          {isFullscreen ? <Minimize className={ICON_PRIMARY} strokeWidth={1.5} /> : <Maximize className={ICON_PRIMARY} strokeWidth={1.5} />}
        </ControlButton>
      </div>
    </div>
  );
};
