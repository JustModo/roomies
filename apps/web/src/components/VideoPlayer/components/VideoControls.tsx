import React, { useCallback } from 'react';
import { Play, Pause, RotateCcw, RotateCw, Volume2, VolumeX, Maximize, Minimize, MessageSquare, ClosedCaption, Smile, Minus, Plus } from 'lucide-react';
import { RoomState, MediaInfo } from '@roomies/contracts';
import { Level } from 'hls.js';
import { useActiveMenu } from '../../../hooks/useActiveMenu';
import { useChat, DEFAULT_EMOJI_PICKER } from '../../../contexts/ChatContext';
import { useMobileView } from '../../../hooks/useMobileView';
import { ControlPopover, PopoverSection, PopoverItem, PopoverEmpty } from './ControlPopover';

interface VideoControlsProps {
  isLocked: boolean;
  roomPlaybackState?: RoomState['playback'];
  volume: number;
  setVolume: (volume: number) => void;
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
  volume,
  setVolume,
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
  const { activeMenu, setActiveMenu, toggleMenu, containerRef } = useActiveMenu<'quality' | 'subtitle' | 'emoji'>();
  const { unreadCount, emojiPicker, emojiMuted, sendEmoji } = useChat();
  const { isMobileFullscreenLandscape, isMobilePortrait } = useMobileView();

  const handleEmojiClick = useCallback((emoji: string) => {
    sendEmoji(emoji);
    // Don't close picker - allow multiple emoji sends
  }, [sendEmoji]);

  const isPlaying = roomPlaybackState?.state === 'playing';

  return (
    <div
      data-video-controls="true"
      className="flex items-center justify-between px-2 sm:px-4 lg:px-6 pt-1 pb-2 sm:pt-1 sm:pb-3 lg:pt-1 lg:pb-4 gap-1"
    >
      {/* ── Left cluster: play, seek offsets, volume, time ── */}
      <div className="flex items-center min-w-0">
        {/* Play Button */}
        <Btn
          disabled={isLocked}
          onClick={handlePlayPause}
          title={isPlaying ? 'Pause' : 'Play'}
          important
        >
          {isPlaying
            ? <Pause className="w-5 h-5 lg:w-6 lg:h-6" fill="currentColor" />
            : <Play className="w-5 h-5 lg:w-6 lg:h-6" fill="currentColor" />}
        </Btn>

        {/* Space / Divider after Play */}
        <div className="w-px h-4 lg:h-5 bg-ash/20 mx-1.5 sm:mx-2 lg:mx-3" />

        {/* The two seek buttons (Back & Forward) */}
        <div className="flex items-center gap-0.5 sm:gap-1">
          <Btn disabled={isLocked} onClick={() => handleSeekOffset(-10)} title="Back 10s">
            <RotateCcw className="w-[18px] h-[18px] lg:w-5 lg:h-5" strokeWidth={1.5} />
          </Btn>
          <Btn disabled={isLocked} onClick={() => handleSeekOffset(10)} title="Forward 10s">
            <RotateCw className="w-[18px] h-[18px] lg:w-5 lg:h-5" strokeWidth={1.5} />
          </Btn>
        </div>

        {/* Space / Divider after the two buttons */}
        <div className="w-px h-4 lg:h-5 bg-ash/20 mx-1.5 sm:mx-2 lg:mx-3" />

        {/* Volume & Play Time */}
        <div className="flex items-center gap-1 sm:gap-1.5">
          {/* Volume Button */}
          <div className="group relative flex items-center justify-center">
            <Btn onClick={() => setVolume(volume === 0 ? 1 : 0)} title={volume === 0 ? 'Unmute' : 'Mute'}>
              {volume === 0
                ? <VolumeX className="w-[18px] h-[18px] lg:w-5 lg:h-5" strokeWidth={1.5} />
                : <Volume2 className="w-[18px] h-[18px] lg:w-5 lg:h-5" strokeWidth={1.5} />}
            </Btn>
            
            {/* Vertical Volume Slider Popup */}
            <div className="absolute bottom-full mb-1 left-1/2 -translate-x-1/2 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-50 pb-2">
              <div className="bg-ink/95 backdrop-blur-md border border-ash/20 py-3 rounded-lg shadow-2xl flex flex-col items-center justify-center w-[40px] h-[120px]">
                <div className="text-[10px] text-paper/70 font-mono font-bold mb-3">
                  {Math.round(volume * 100)}
                </div>
                
                <div className="relative w-1.5 h-16 bg-ash/30 rounded-full flex justify-center">
                  {/* Filled part (blue) */}
                  <div 
                    className="absolute bottom-0 w-full bg-blue-500 rounded-full pointer-events-none transition-all duration-75" 
                    style={{ height: `${volume * 100}%` }}
                  />
                  {/* Invisible slider input for interaction */}
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.01"
                    value={volume}
                    onChange={(e) => setVolume(parseFloat(e.target.value))}
                    className="absolute top-1/2 left-1/2 w-16 h-6 opacity-0 cursor-pointer"
                    style={{ transform: 'translate(-50%, -50%) rotate(-90deg)' }}
                  />
                  {/* Thumb dot */}
                  <div 
                    className="absolute w-2.5 h-2.5 bg-paper rounded-full shadow-sm pointer-events-none transition-all duration-75 left-1/2 -translate-x-1/2"
                    style={{ bottom: `calc(${volume * 100}% - 5px)` }}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Play time with little space before it */}
          <span className="hidden xs:flex items-center h-7 lg:h-9 font-mono text-[11px] lg:text-base text-paper/70 whitespace-nowrap ml-0.5 sm:ml-1">
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

            {/* Media Settings (Rate, Quality, Subtitles, Emoji) */}
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
                    <ControlPopover className="bottom-full right-0 mb-3">
                      <PopoverSection label="Quality">
                        <PopoverItem active={currentLevel === -1} onClick={() => { handleQualityChange(-1); setActiveMenu(null); }}>
                          Auto
                        </PopoverItem>
                        {[...levels].reverse().map((level) => {
                          const originalIndex = levels.indexOf(level);
                          return (
                            <PopoverItem
                              key={originalIndex}
                              active={currentLevel === originalIndex}
                              onClick={() => { handleQualityChange(originalIndex); setActiveMenu(null); }}
                            >
                              {level.height}p
                            </PopoverItem>
                          );
                        })}
                      </PopoverSection>
                    </ControlPopover>
                  )}
                </div>
              )}

              {/* Subtitle Selector */}
              {setActiveSubtitleId && displaySubtitleLabel && (
                <div className="relative">
                  <Btn
                    onClick={() => toggleMenu('subtitle')}
                    active={activeSubtitleId !== null}
                    className={activeSubtitleId !== null ? '!text-blue-400' : ''}
                    title="Subtitles"
                  >
                    <ClosedCaption className="w-[18px] h-[18px] lg:w-5 lg:h-5" strokeWidth={1.5} />
                  </Btn>

                  {activeMenu === 'subtitle' && (
                    <ControlPopover className="bottom-full right-0 mb-3">
                      <PopoverSection label="Subtitles">
                        {!(mediaInfo?.subtitles?.length) ? (
                          <PopoverEmpty>No subtitles available</PopoverEmpty>
                        ) : (
                          <>
                            <PopoverItem active={activeSubtitleId === null} onClick={() => { setActiveSubtitleId(null); setActiveMenu(null); }}>
                              Off
                            </PopoverItem>
                            {mediaInfo!.subtitles.map((sub) => (
                              <PopoverItem
                                key={sub.id}
                                active={activeSubtitleId === sub.id}
                                onClick={() => { setActiveSubtitleId(sub.id); setActiveMenu(null); }}
                              >
                                {displaySubtitleLabel(sub.language)}
                              </PopoverItem>
                            ))}
                          </>
                        )}
                      </PopoverSection>

                      {activeSubtitleId !== null && setSubtitleOffsetSec && (
                        <PopoverSection label="Timing">
                          <div className="flex items-center justify-center gap-3 px-3.5 py-2">
                            <button
                              onClick={() => setSubtitleOffsetSec(Math.round((subtitleOffsetSec - 0.5) * 10) / 10)}
                              className="flex items-center justify-center w-7 h-7 text-paper/80 hover:text-paper hover:bg-ash/20 transition-colors flex-shrink-0"
                              title="Shift earlier"
                            >
                              <Minus className="w-3.5 h-3.5" strokeWidth={2} />
                            </button>
                            <span className="text-[13px] lg:text-sm text-paper tabular-nums w-14 text-center">
                              {subtitleOffsetSec > 0 ? '+' : ''}{subtitleOffsetSec.toFixed(1)}s
                            </span>
                            <button
                              onClick={() => setSubtitleOffsetSec(Math.round((subtitleOffsetSec + 0.5) * 10) / 10)}
                              className="flex items-center justify-center w-7 h-7 text-paper/80 hover:text-paper hover:bg-ash/20 transition-colors flex-shrink-0"
                              title="Shift later"
                            >
                              <Plus className="w-3.5 h-3.5" strokeWidth={2} />
                            </button>
                          </div>
                          {subtitleOffsetSec !== 0 && (
                            <button
                              onClick={() => setSubtitleOffsetSec(0)}
                              className="w-full text-center pb-1.5 text-[11px] lg:text-xs text-paper/50 hover:text-paper transition-colors"
                            >
                              Reset
                            </button>
                          )}
                        </PopoverSection>
                      )}

                      {activeSubtitleId !== null && setSubtitleFontScale && (
                        <PopoverSection label="Size">
                          <div className="flex items-center mx-3.5 my-1.5 border border-ash/20">
                            {[{ label: 'S', scale: 0.75 }, { label: 'M', scale: 1 }, { label: 'L', scale: 1.5 }].map(({ label, scale }, i) => (
                              <button
                                key={label}
                                onClick={() => setSubtitleFontScale(scale)}
                                className={`flex-1 py-1.5 text-[12px] lg:text-sm transition-colors ${i > 0 ? 'border-l border-ash/20' : ''} ${
                                  Math.abs(subtitleFontScale - scale) < 0.01 ? 'bg-blue-500/10 text-blue-400 font-medium' : 'text-paper hover:bg-ash/20'
                                }`}
                              >
                                {label}
                              </button>
                            ))}
                          </div>
                        </PopoverSection>
                      )}
                    </ControlPopover>
                  )}
                </div>
              )}

              {/* Emoji picker — disabled when reactions are muted */}
              {onToggleChat && !isMobilePortrait && (
                <div className="relative">
                  <Btn
                    disabled={emojiMuted}
                    onClick={() => !emojiMuted && toggleMenu('emoji')}
                    active={activeMenu === 'emoji'}
                    title={emojiMuted ? 'Reactions muted' : 'Reactions'}
                  >
                    <Smile className="w-[18px] h-[18px] lg:w-5 lg:h-5" strokeWidth={1.5} />
                  </Btn>
                  {!emojiMuted && activeMenu === 'emoji' && (
                    <ControlPopover
                      className={
                        isMobileFullscreenLandscape
                          ? 'right-full mr-2 top-1/2 -translate-y-1/2'
                          : 'right-full mr-2 top-1/2 -translate-y-1/2 sm:bottom-full sm:right-0 sm:top-auto sm:translate-y-0 sm:mb-3'
                      }
                    >
                      <div className="grid grid-cols-6 gap-6 p-2">
                        {(emojiPicker || DEFAULT_EMOJI_PICKER).map((emoji) => (
                          <button
                            key={emoji}
                            onClick={() => handleEmojiClick(emoji)}
                            className="flex items-center justify-center aspect-square text-base sm:text-lg lg:text-xl hover:bg-ash/30 hover:scale-110 transition-all duration-150"
                          >
                            {emoji}
                          </button>
                        ))}
                      </div>
                    </ControlPopover>
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
            important
          >
            {isFullscreen
              ? <Minimize className="w-5 h-5 lg:w-6 lg:h-6" strokeWidth={1.5} />
              : <Maximize className="w-5 h-5 lg:w-6 lg:h-6" strokeWidth={1.5} />}
          </Btn>
        </div>
      </div>
    </div>
  );
};
