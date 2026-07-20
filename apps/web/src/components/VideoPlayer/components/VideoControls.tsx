import React from 'react';
import { Play, Pause, RotateCcw, RotateCw, Volume2, VolumeX, Maximize, Minimize, MessageSquare, ClosedCaption } from 'lucide-react';
import { RoomState, MediaInfo } from '@roomies/contracts';
import { Level } from 'hls.js';
import { useActiveMenu } from '../../../hooks/useActiveMenu';
import { useChat } from '../../../contexts/ChatContext';

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
  mediaInfo?: MediaInfo | null;
  activeSubtitleId?: string | null;
  setActiveSubtitleId?: (id: string | null) => void;
  displaySubtitleLabel?: (language: string | null) => string;
  subtitleOffsetSec?: number;
  setSubtitleOffsetSec?: (offset: number) => void;
  subtitleFontScale?: number;
  setSubtitleFontScale?: (scale: number) => void;
  isAsyncMode?: boolean;
  onToggleAsync?: () => void;
  allowAsyncMode?: boolean;
}

// Compact icon button — smaller padding on mobile
const Btn: React.FC<{
  onClick?: () => void;
  disabled?: boolean;
  active?: boolean;
  important?: boolean;
  className?: string;
  children: React.ReactNode;
  title?: string;
}> = ({ onClick, disabled, active, important, className = '', children, title }) => (
  <button
    onClick={onClick}
    disabled={disabled}
    title={title}
    className={`
      flex items-center justify-center
      p-1.5 sm:p-2
      bg-transparent border-none
      transition-colors duration-150
      ${active ? 'text-paper' : important ? 'text-paper/90' : 'text-fog'}
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
  mediaInfo,
  activeSubtitleId,
  setActiveSubtitleId,
  displaySubtitleLabel,
  subtitleOffsetSec = 0,
  setSubtitleOffsetSec,
  subtitleFontScale = 1,
  setSubtitleFontScale,
  isAsyncMode,
  onToggleAsync,
  allowAsyncMode = true,
}) => {
  const { activeMenu, setActiveMenu, toggleMenu, containerRef } = useActiveMenu<'quality' | 'subtitle'>();
  const { unreadCount } = useChat();

  const isPlaying = roomPlaybackState?.state === 'playing';

  return (
    <div className="flex items-center justify-between px-2 sm:px-4 lg:px-6 pt-1 pb-2 sm:pt-1 sm:pb-3 lg:pt-1 lg:pb-4 gap-1">
      {/* ── Left cluster: play, seek offsets, mute, time ── */}
      <div className="flex items-center min-w-0">
        {/* Playback Controls */}
        <div className="flex items-center gap-0.5 sm:gap-1">
          <Btn
            disabled={isLocked}
            onClick={handlePlayPause}
            title={isPlaying ? 'Pause' : 'Play'}
            important
          >
            {isPlaying
              ? <Pause className="w-[18px] h-[18px] lg:w-5 lg:h-5" fill="currentColor" />
              : <Play className="w-[18px] h-[18px] lg:w-5 lg:h-5" fill="currentColor" />}
          </Btn>

          <Btn disabled={isLocked} onClick={() => handleSeekOffset(-10)} title="Back 10s">
            <RotateCcw className="w-[18px] h-[18px] lg:w-5 lg:h-5" strokeWidth={1.5} />
          </Btn>

          <Btn disabled={isLocked} onClick={() => handleSeekOffset(10)} title="Forward 10s">
            <RotateCw className="w-[18px] h-[18px] lg:w-5 lg:h-5" strokeWidth={1.5} />
          </Btn>
        </div>

        <div className="w-px h-4 lg:h-5 bg-ash/20 mx-1.5 sm:mx-2 lg:mx-4" />

        {/* Audio & Time */}
        <div className="flex items-center gap-0.5 sm:gap-1">
          <Btn onClick={() => setIsMuted(!isMuted)} title={isMuted ? 'Unmute' : 'Mute'}>
            {isMuted
              ? <VolumeX className="w-[18px] h-[18px] lg:w-5 lg:h-5" strokeWidth={1.5} />
              : <Volume2 className="w-[18px] h-[18px] lg:w-5 lg:h-5" strokeWidth={1.5} />}
          </Btn>

          {/* Time — hidden on very small portrait so it doesn't wrap */}
          <span className="hidden xs:flex items-center h-7 lg:h-9 font-mono text-[11px] lg:text-base text-paper/70 whitespace-nowrap ml-1 sm:ml-2">
            {formatTime(currentTime)} / {formatTime(totalDuration)}
          </span>
        </div>
      </div>

      {/* ── Right cluster: rate, quality, chat, fullscreen ── */}
      <div className="flex items-center flex-shrink-0 relative">
        {mediaInfo?.hlsUrl && (
          <>
            {/* Sync Mode Toggle */}
            {onToggleAsync && (
              <>
                <div className="flex items-center gap-0 sm:gap-1">
                  <button
                    disabled={!allowAsyncMode}
                    onClick={onToggleAsync}
                    className={`text-[11px] lg:text-base font-mono transition-colors px-1 lg:px-2 h-7 lg:h-9 flex items-center justify-center flex-shrink-0 disabled:opacity-30 disabled:cursor-not-allowed ${
                      !isAsyncMode ? 'text-blue-400 font-medium' : 'text-fog hover:text-paper'
                    }`}
                    title={!allowAsyncMode ? 'Async mode disabled by admin' : (isAsyncMode ? 'Resync with Room' : 'Go Async Mode')}
                  >
                    SYNC
                  </button>
                </div>
                <div className="w-px h-4 lg:h-5 bg-ash/20 mx-1 sm:mx-1.5 lg:mx-3" />
              </>
            )}

            {/* Media Settings (Rate, Quality, Subtitles) */}
            <div className="flex items-center gap-0 sm:gap-1" ref={containerRef}>
              {/* Playback rate */}
              <button
                disabled={isLocked}
                onClick={() => { cyclePlaybackRate(); setActiveMenu(null); }}
                className="text-[11px] lg:text-base font-mono text-fog hover:text-paper transition-colors px-1 lg:px-2 h-7 lg:h-9 flex items-center justify-center disabled:opacity-30 disabled:cursor-not-allowed flex-shrink-0"
                title="Playback speed"
              >
                {roomPlaybackState?.playbackRate || 1}x
              </button>

              {/* Quality selector */}
              {levels.length > 0 && (
                <div className="relative">
                  <button
                    onClick={() => toggleMenu('quality')}
                    className={`text-[11px] lg:text-base font-mono transition-colors px-1 lg:px-2 h-7 lg:h-9 flex items-center justify-center flex-shrink-0 ${
                      currentLevel !== -1 ? 'text-blue-400 font-medium' : 'text-fog hover:text-paper'
                    }`}
                    title="Quality"
                  >
                    {currentLevel === -1 ? 'AUTO' : `${levels[currentLevel]?.height}p`}
                  </button>

                  {activeMenu === 'quality' && (
                    <div className="absolute bottom-full right-0 mb-3 bg-ink/95 backdrop-blur-md border border-ash/20 py-2 min-w-[110px] overflow-hidden z-50 shadow-2xl">
                      <div className="px-3 py-1.5 text-[10px] lg:text-xs text-paper/50 uppercase tracking-widest font-semibold border-b border-ash/10 mb-1">Quality</div>
                      <button
                        onClick={() => { handleQualityChange(-1); setActiveMenu(null); }}
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
                            onClick={() => { handleQualityChange(originalIndex); setActiveMenu(null); }}
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

              {/* Subtitle Selector */}
              {setActiveSubtitleId && displaySubtitleLabel && (
                <div className="relative">
                  <Btn
                    onClick={() => toggleMenu('subtitle')}
                    active={activeSubtitleId !== null}
                    title="Subtitles"
                  >
                    <ClosedCaption className="w-[18px] h-[18px] lg:w-5 lg:h-5" strokeWidth={1.5} />
                  </Btn>

                  {activeMenu === 'subtitle' && (
                    <div className="absolute bottom-full right-0 mb-3 bg-ink/95 backdrop-blur-md border border-ash/20 py-2 min-w-[140px] overflow-hidden z-50 shadow-2xl">
                      <div className="px-3 py-1.5 text-[10px] lg:text-xs text-paper/50 uppercase tracking-widest font-semibold border-b border-ash/10 mb-1">Subtitles</div>
                      {!(mediaInfo?.subtitles?.length) ? (
                        <div className="px-3 py-2 text-[12px] lg:text-sm text-paper/50 italic">
                          None
                        </div>
                      ) : (
                        <>
                          <button
                            onClick={() => { setActiveSubtitleId(null); setActiveMenu(null); }}
                            className={`w-full text-left px-3 py-2 text-[12px] lg:text-sm transition-colors ${
                              activeSubtitleId === null ? 'bg-blue-500/10 text-blue-400 font-medium' : 'text-paper hover:bg-ash/20'
                            }`}
                          >
                            Off
                          </button>
                          {mediaInfo!.subtitles.map((sub) => (
                            <button
                              key={sub.id}
                              onClick={() => { setActiveSubtitleId(sub.id); setActiveMenu(null); }}
                              className={`w-full text-left px-3 py-2 text-[12px] lg:text-sm transition-colors ${
                                activeSubtitleId === sub.id ? 'bg-blue-500/10 text-blue-400 font-medium' : 'text-paper hover:bg-ash/20'
                              }`}
                            >
                              {displaySubtitleLabel(sub.language)}
                            </button>
                          ))}
                        </>
                      )}

                      {setSubtitleOffsetSec && (
                        <>
                          <div className="px-3 pt-2 pb-1 mt-1 text-[10px] lg:text-xs text-paper/50 uppercase tracking-widest font-semibold border-t border-ash/10">Offset</div>
                          <div className="flex items-center justify-between px-3 py-1.5 gap-2">
                            <button
                              onClick={() => setSubtitleOffsetSec(Math.round((subtitleOffsetSec - 0.5) * 10) / 10)}
                              className="px-2 py-1 text-[12px] lg:text-sm text-paper hover:bg-ash/20"
                            >
                              -0.5s
                            </button>
                            <span className="text-[12px] lg:text-sm text-paper/80 tabular-nums">
                              {subtitleOffsetSec > 0 ? '+' : ''}{subtitleOffsetSec.toFixed(1)}s
                            </span>
                            <button
                              onClick={() => setSubtitleOffsetSec(Math.round((subtitleOffsetSec + 0.5) * 10) / 10)}
                              className="px-2 py-1 text-[12px] lg:text-sm text-paper hover:bg-ash/20"
                            >
                              +0.5s
                            </button>
                          </div>
                          {subtitleOffsetSec !== 0 && (
                            <button
                              onClick={() => setSubtitleOffsetSec(0)}
                              className="w-full text-center px-3 py-1 text-[11px] lg:text-xs text-paper/50 hover:text-paper"
                            >
                              Reset offset
                            </button>
                          )}
                        </>
                      )}

                      {setSubtitleFontScale && (
                        <>
                          <div className="px-3 pt-2 pb-1 mt-1 text-[10px] lg:text-xs text-paper/50 uppercase tracking-widest font-semibold border-t border-ash/10">Size</div>
                          <div className="flex items-center justify-center gap-2 px-3 py-1.5">
                            {[{ label: 'S', scale: 0.75 }, { label: 'M', scale: 1 }, { label: 'L', scale: 1.5 }].map(({ label, scale }) => (
                              <button
                                key={label}
                                onClick={() => setSubtitleFontScale(scale)}
                                className={`px-2.5 py-1 text-[12px] lg:text-sm transition-colors ${
                                  Math.abs(subtitleFontScale - scale) < 0.01 ? 'bg-blue-500/10 text-blue-400 font-medium' : 'text-paper hover:bg-ash/20'
                                }`}
                              >
                                {label}
                              </button>
                            ))}
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="w-px h-4 lg:h-5 bg-ash/20 mx-1 sm:mx-1.5 lg:mx-3" />
          </>
        )}

        {/* Display Settings */}
        <div className="flex items-center gap-0.5 sm:gap-1">
          {/* Chat toggle — desktop only */}
          {onToggleChat && (
            <Btn
              onClick={onToggleChat}
              active={showChat}
              className="hidden lg:flex relative"
              title="Toggle chat"
            >
              <MessageSquare className="w-[18px] h-[18px] lg:w-5 lg:h-5" strokeWidth={1.5} />
              {unreadCount > 0 && !showChat && (
                <span className="absolute -top-1 -right-1 min-w-[14px] h-[14px] px-1 rounded-full bg-blue-400 text-[9px] flex items-center justify-center text-white font-bold">
                  {unreadCount > 99 ? '99+' : unreadCount}
                </span>
              )}
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
              ? <Minimize className="w-[18px] h-[18px] lg:w-5 lg:h-5" strokeWidth={1.5} />
              : <Maximize className="w-[18px] h-[18px] lg:w-5 lg:h-5" strokeWidth={1.5} />}
          </Btn>
        </div>
      </div>
    </div>
  );
};
