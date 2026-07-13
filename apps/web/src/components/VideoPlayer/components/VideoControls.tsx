import React, { useState } from 'react';
import { Play, Pause, RotateCcw, RotateCw, Volume2, VolumeX, Maximize, Minimize, MessageSquare } from 'lucide-react';
import { RoomState } from '../../../hooks/useRoomSync';
import { Level } from 'hls.js';

interface VideoControlsProps {
  isLocked: boolean;
  roomPlaybackState?: RoomState['playback'];
  isMuted: boolean;
  setIsMuted: (muted: boolean) => void;
  currentTime: number;
  totalDuration: number;
  formatTime: (seconds: number) => string;
  handlePlayPause: () => void;
  handleSeekOffset: (offset: number) => void;
  cyclePlaybackRate: () => void;
  levels: Level[];
  currentLevel: number;
  handleQualityChange: (index: number) => void;
  showChat?: boolean;
  onToggleChat?: () => void;
  isFullscreen?: boolean;
}

// Compact icon button — smaller padding on mobile
const Btn: React.FC<{
  onClick?: () => void;
  disabled?: boolean;
  active?: boolean;
  className?: string;
  children: React.ReactNode;
  title?: string;
}> = ({ onClick, disabled, active, className = '', children, title }) => (
  <button
    onClick={onClick}
    disabled={disabled}
    title={title}
    className={`
      flex items-center justify-center
      p-1.5 sm:p-2
      bg-transparent border-none
      transition-colors duration-150
      ${active ? 'text-paper' : 'text-fog'}
      hover:text-paper
      disabled:opacity-30 disabled:cursor-not-allowed
      focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-paper
      ${className}
    `}
  >
    {children}
  </button>
);

export const VideoControls: React.FC<VideoControlsProps> = ({
  isLocked,
  roomPlaybackState,
  isMuted,
  setIsMuted,
  currentTime,
  totalDuration,
  formatTime,
  handlePlayPause,
  handleSeekOffset,
  cyclePlaybackRate,
  levels,
  currentLevel,
  handleQualityChange,
  showChat,
  onToggleChat,
  isFullscreen,
}) => {
  const [showQualityMenu, setShowQualityMenu] = useState(false);

  const isPlaying = roomPlaybackState?.state === 'playing';

  return (
    <div className="flex items-center justify-between px-2 sm:px-4 lg:px-6 py-2 sm:py-3 lg:py-4 gap-1">
      {/* ── Left cluster: play, seek offsets, mute, time ── */}
      <div className="flex items-center gap-0.5 sm:gap-2 lg:gap-3 min-w-0">
        <Btn
          disabled={isLocked}
          onClick={handlePlayPause}
          title={isPlaying ? 'Pause' : 'Play'}
        >
          {isPlaying
            ? <Pause className="w-[18px] h-[18px] lg:w-5 lg:h-5" fill="currentColor" />
            : <Play className="w-[18px] h-[18px] lg:w-5 lg:h-5" fill="currentColor" />}
        </Btn>

        <Btn disabled={isLocked} onClick={() => handleSeekOffset(-10)} title="Back 10s">
          <RotateCcw className="w-4 h-4" strokeWidth={1.5} />
        </Btn>

        <Btn disabled={isLocked} onClick={() => handleSeekOffset(10)} title="Forward 10s">
          <RotateCw className="w-4 h-4" strokeWidth={1.5} />
        </Btn>

        <Btn onClick={() => setIsMuted(!isMuted)} title={isMuted ? 'Unmute' : 'Mute'}>
          {isMuted
            ? <VolumeX className="w-4 h-4" strokeWidth={1.5} />
            : <Volume2 className="w-4 h-4" strokeWidth={1.5} />}
        </Btn>

        {/* Time — hidden on very small portrait so it doesn't wrap */}
        <span className="hidden xs:flex items-center h-7 lg:h-9 font-mono text-[11px] lg:text-base text-paper/70 whitespace-nowrap ml-1">
          {formatTime(currentTime)} / {formatTime(totalDuration)}
        </span>
      </div>

      {/* ── Right cluster: rate, quality, chat, fullscreen ── */}
      <div className="flex items-center gap-0.5 sm:gap-2 lg:gap-3 flex-shrink-0 relative">
        {/* Playback rate */}
        <button
          disabled={isLocked}
          onClick={cyclePlaybackRate}
          className="text-[11px] lg:text-base font-mono text-paper/70 hover:text-paper transition-colors w-7 lg:w-12 h-7 lg:h-9 flex items-center justify-center disabled:opacity-30 disabled:cursor-not-allowed flex-shrink-0"
          title="Playback speed"
        >
          {roomPlaybackState?.playbackRate || 1}x
        </button>

        {/* Quality selector */}
        {levels.length > 0 && (
          <div className="relative">
            <button
              onClick={() => setShowQualityMenu(!showQualityMenu)}
              className={`text-[11px] lg:text-base font-mono transition-colors w-10 lg:w-16 h-7 lg:h-9 flex items-center justify-center flex-shrink-0 ${
                currentLevel !== -1 ? 'text-blue-400 font-medium' : 'text-paper/70 hover:text-paper'
              }`}
              title="Quality"
            >
              {currentLevel === -1 ? 'AUTO' : `${levels[currentLevel]?.height}p`}
            </button>

            {showQualityMenu && (
              <div className="absolute bottom-full right-0 mb-3 bg-ink/95 backdrop-blur-md border border-ash/20 py-2 min-w-[110px] overflow-hidden z-50 shadow-2xl">
                <div className="px-3 py-1.5 text-[10px] lg:text-xs text-paper/50 uppercase tracking-widest font-semibold border-b border-ash/10 mb-1">Quality</div>
                <button
                  onClick={() => { handleQualityChange(-1); setShowQualityMenu(false); }}
                  className={`w-full text-left px-3 py-2 text-[12px] lg:text-sm transition-colors ${
                    currentLevel === -1 ? 'bg-blue-500/10 text-blue-400 font-medium' : 'text-paper hover:bg-ash/20'
                  }`}
                >
                  Auto
                </button>
                {[...levels].reverse().map((level) => {
                  const originalIndex = levels.indexOf(level);
                  return (
                    <button
                      key={originalIndex}
                      onClick={() => { handleQualityChange(originalIndex); setShowQualityMenu(false); }}
                      className={`w-full text-left px-3 py-2 text-[12px] lg:text-sm transition-colors ${
                        currentLevel === originalIndex ? 'bg-blue-500/10 text-blue-400 font-medium' : 'text-paper hover:bg-ash/20'
                      }`}
                    >
                      {level.height}p
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Chat toggle — desktop only */}
        {onToggleChat && (
          <Btn
            onClick={onToggleChat}
            active={showChat}
            className="hidden lg:flex"
            title="Toggle chat"
          >
            <MessageSquare className="w-4 h-4" strokeWidth={1.5} />
          </Btn>
        )}

        {/* Fullscreen */}
        <Btn
          onClick={() => {
            if (document.fullscreenElement) {
              document.exitFullscreen();
            } else {
              document.documentElement.requestFullscreen();
            }
          }}
          title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
        >
          {isFullscreen
            ? <Minimize className="w-4 h-4" strokeWidth={1.5} />
            : <Maximize className="w-4 h-4" strokeWidth={1.5} />}
        </Btn>
      </div>
    </div>
  );
};
