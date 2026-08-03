import React, { useState } from 'react';
import { Play, Pause, RotateCcw, RotateCw, Volume2, VolumeX, Maximize, Minimize, MessageSquare, Settings, ChevronRight, ChevronLeft, Minus, Plus } from 'lucide-react';
import { RoomState, MediaInfo } from '@roomies/contracts';
import { Level } from 'hls.js';
import { useActiveMenu } from '../../../hooks/useActiveMenu';
import { useChat } from '../../../contexts/ChatContext';
import { ControlPopover, PopoverItem, PopoverEmpty, PopoverSection } from './ControlPopover';
import { BAR_EDGE_X, ICON_BTN_PADDING, ICON_PRIMARY, ICON_SECONDARY, ACTIVE_TICK, CONTROLS_GAP, TIME_PAIR_WIDTH } from '../styleTokens';

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
  playbackRate: number;
  onSetRate: (rate: number) => void;
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
  uiVisible?: boolean;
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
      ${ICON_BTN_PADDING}
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

// Menu row for the top-level settings view — shows label, current value, and chevron
const SettingsRow: React.FC<{
  label: string;
  value: string;
  onClick: () => void;
}> = ({ label, value, onClick }) => (
  <button
    onClick={onClick}
    className="w-full flex items-center justify-between gap-2 px-3 sm:px-3.5 py-1.5 sm:py-2 text-[11px] sm:text-[13px] lg:text-sm text-paper hover:bg-ash/20 transition-colors"
  >
    <span>{label}</span>
    <span className="flex items-center gap-1 text-paper/50">
      <span className="text-[10px] sm:text-[12px] lg:text-[13px]">{value}</span>
      <ChevronRight className="w-3.5 h-3.5 sm:w-4 sm:h-4" strokeWidth={2} />
    </span>
  </button>
);

// Back-button header for sub-panels
const SubPanelHeader: React.FC<{
  label: string;
  onBack: () => void;
}> = ({ label, onBack }) => (
  <button
    onClick={onBack}
    className="w-full flex items-center gap-1.5 px-3 sm:px-3.5 py-1.5 sm:py-2 text-[11px] sm:text-[13px] lg:text-sm text-paper/70 hover:text-paper hover:bg-ash/10 transition-colors border-b border-ash/15"
  >
    <ChevronLeft className="w-3.5 h-3.5 sm:w-4 sm:h-4" strokeWidth={2} />
    <span className="font-medium">{label}</span>
  </button>
);

type SettingsSubMenu = null | 'quality' | 'subtitles' | 'subtitle-settings';

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
  playbackRate,
  onSetRate,
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
  uiVisible = true,
}) => {
  const { activeMenu, toggleMenu, containerRef } = useActiveMenu<'settings'>();
  const { unreadCount } = useChat();
  const [settingsSubMenu, setSettingsSubMenu] = useState<SettingsSubMenu>(null);

  // Close settings menu when controls auto-hide
  React.useEffect(() => {
    if (!uiVisible && activeMenu === 'settings') {
      toggleMenu('settings'); // closes it
      setSettingsSubMenu(null);
    }
  }, [uiVisible]);

  const isPlaying = roomPlaybackState?.state === 'playing';

  // Reset sub-menu when the popover closes
  const handleToggleSettings = () => {
    toggleMenu('settings');
    if (activeMenu === 'settings') {
      // Closing — reset sub-menu
      setSettingsSubMenu(null);
    }
  };

  // Current value labels for the top-level menu
  const qualityLabel = currentLevel === -1 ? 'Auto' : `${levels[currentLevel]?.height}p`;
  const subtitleLabel = activeSubtitleId === null
    ? 'Off'
    : (displaySubtitleLabel
      ? displaySubtitleLabel(mediaInfo?.subtitles?.find(s => s.id === activeSubtitleId)?.language ?? null)
      : 'On');

  const handleCycleSpeed = () => {
    if (isLocked) return;
    const rates = [0.5, 1, 1.25, 1.5, 2];
    const next = rates[(rates.indexOf(playbackRate) + 1) % rates.length];
    onSetRate(next);
  };

  return (
    <div
      data-video-controls="true"
      className={`flex items-center justify-between ${BAR_EDGE_X} pt-0 pb-2 sm:pb-3 lg:pb-4 gap-1`}
    >
      {/* ── Left cluster: play, seek offsets, volume ── */}
      <div className={`flex items-center min-w-0 ${CONTROLS_GAP}`}>
        {/* Play Button */}
        <Btn
          disabled={isLocked}
          onClick={handlePlayPause}
          title={isPlaying ? 'Pause' : 'Play'}
          important
        >
          {isPlaying
            ? <Pause className={ICON_PRIMARY} fill="currentColor" />
            : <Play className={ICON_PRIMARY} fill="currentColor" />}
        </Btn>

        {/* The two seek buttons (Back & Forward) */}
        <div className={`flex items-center ${CONTROLS_GAP}`}>
          <Btn disabled={isLocked} onClick={() => handleSeekOffset(-10)} title="Back 10s">
            <RotateCcw className={ICON_SECONDARY} strokeWidth={1.5} />
          </Btn>
          <Btn disabled={isLocked} onClick={() => handleSeekOffset(10)} title="Forward 10s">
            <RotateCw className={ICON_SECONDARY} strokeWidth={1.5} />
          </Btn>
        </div>

        {/* Volume */}
        <div className="group relative flex items-center justify-center">
          <Btn onClick={() => setVolume(volume === 0 ? 1 : 0)} title={volume === 0 ? 'Unmute' : 'Mute'}>
            {volume === 0
              ? <VolumeX className={ICON_SECONDARY} strokeWidth={1.5} />
              : <Volume2 className={ICON_SECONDARY} strokeWidth={1.5} />}
          </Btn>

          {/* Vertical Volume Slider Popup */}
          <div className="absolute bottom-full mb-1 left-1/2 -translate-x-1/2 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-50 pb-2">
            <div className="bg-ink/95 backdrop-blur-md border border-ash/20 py-3 flex flex-col items-center justify-center w-[40px] h-[120px]">
              <div className="text-[10px] text-paper/70 font-mono font-bold mb-3">
                {Math.round(volume * 100)}
              </div>

              <div className="relative w-1.5 h-16 bg-ash/30 flex justify-center">
                {/* Filled part (blue) */}
                <div
                  className="absolute bottom-0 w-full bg-blue-500 pointer-events-none transition-all duration-75"
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
                  className="absolute w-2.5 h-2.5 bg-paper pointer-events-none transition-all duration-75 left-1/2 -translate-x-1/2"
                  style={{ bottom: `calc(${volume * 100}% - 5px)` }}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Current / total time — hidden on mobile portrait */}
        <span className={`hidden sm:flex font-mono text-xs lg:text-sm text-paper/70 tabular-nums whitespace-nowrap shrink-0 ${TIME_PAIR_WIDTH}`}>
          {formatTime(currentTime)} / {formatTime(totalDuration)}
        </span>
      </div>

      {/* ── Right cluster: sync, speed, chat, settings, fullscreen ── */}
      <div className={`flex items-center flex-shrink-0 relative ${CONTROLS_GAP}`}>
        {/* Sync Mode Toggle — stays on the bar */}
        {mediaInfo?.hlsUrl && onToggleAsync && (
          <button
            disabled={!allowAsyncMode}
            onClick={onToggleAsync}
            className={`relative text-[11px] lg:text-base font-mono transition-colors px-1 lg:px-2 h-6 lg:h-8 flex items-center justify-center flex-shrink-0 disabled:opacity-30 disabled:cursor-not-allowed ${!isAsyncMode ? `text-blue-400 font-medium ${ACTIVE_TICK}` : 'text-fog hover:text-paper'
              }`}
            title={!allowAsyncMode ? 'Async mode disabled by admin' : (isAsyncMode ? 'Resync with Room' : 'Go Async Mode')}
          >
            SYNC
          </button>
        )}

        {/* Playback speed toggle — on the bar */}
        {mediaInfo?.hlsUrl && (
          <button
            disabled={isLocked}
            onClick={handleCycleSpeed}
            className="text-[11px] lg:text-base font-mono text-fog hover:text-paper transition-colors px-1 lg:px-2 h-6 lg:h-8 flex items-center justify-center disabled:opacity-30 disabled:cursor-not-allowed flex-shrink-0"
            title="Playback speed"
          >
            {playbackRate}x
          </button>
        )}

        {/* Chat toggle — desktop only */}
        {onToggleChat && (
          <Btn
            onClick={onToggleChat}
            active={showChat}
            className={`hidden lg:flex relative ${showChat ? ACTIVE_TICK : ''}`}
            title="Toggle chat"
          >
            <MessageSquare className={ICON_SECONDARY} strokeWidth={1.5} />
            {unreadCount > 0 && !showChat && (
              <span className="absolute -top-1 -right-1 min-w-[14px] h-[14px] px-1 bg-blue-400 text-[9px] flex items-center justify-center text-white font-bold">
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            )}
          </Btn>
        )}

        {/* Settings ⚙️ — two-level drill-down popover (Quality, Subtitles) */}
        {mediaInfo?.hlsUrl && (
          <div className="relative" ref={containerRef}>
            <Btn
              onClick={handleToggleSettings}
              active={activeMenu === 'settings'}
              title="Settings"
            >
              <Settings className={ICON_SECONDARY} strokeWidth={1.5} />
            </Btn>

            {activeMenu === 'settings' && (
              <ControlPopover className="bottom-full right-0 mb-3">
                {settingsSubMenu === null && (
                  /* ── Top-level: category list ── */
                  <div className="py-1">
                    {levels.length > 0 && (
                      <SettingsRow
                        label="Quality"
                        value={qualityLabel}
                        onClick={() => setSettingsSubMenu('quality')}
                      />
                    )}
                    {setActiveSubtitleId && displaySubtitleLabel && (
                      <SettingsRow
                        label="Subtitles"
                        value={subtitleLabel}
                        onClick={() => setSettingsSubMenu('subtitles')}
                      />
                    )}
                  </div>
                )}

                {settingsSubMenu === 'quality' && levels.length > 0 && (
                  /* ── Quality sub-panel ── */
                  <>
                    <SubPanelHeader label="Quality" onBack={() => setSettingsSubMenu(null)} />
                    <PopoverItem active={currentLevel === -1} onClick={() => handleQualityChange(-1)}>
                      Auto
                    </PopoverItem>
                    {[...levels].reverse().map((level) => {
                      const originalIndex = levels.indexOf(level);
                      return (
                        <PopoverItem
                          key={originalIndex}
                          active={currentLevel === originalIndex}
                          onClick={() => handleQualityChange(originalIndex)}
                        >
                          {level.height}p
                        </PopoverItem>
                      );
                    })}
                  </>
                )}

                {settingsSubMenu === 'subtitles' && setActiveSubtitleId && displaySubtitleLabel && (
                  /* ── Subtitles track list sub-panel ── */
                  <>
                    <SubPanelHeader label="Subtitles" onBack={() => setSettingsSubMenu(null)} />
                    {!(mediaInfo?.subtitles?.length) ? (
                      <PopoverEmpty>No subtitles available</PopoverEmpty>
                    ) : (
                      <>
                        <div className="max-h-[140px] sm:max-h-[180px] overflow-y-auto">
                          <PopoverItem active={activeSubtitleId === null} onClick={() => setActiveSubtitleId(null)}>
                            Off
                          </PopoverItem>
                          {mediaInfo!.subtitles.map((sub) => (
                            <PopoverItem
                              key={sub.id}
                              active={activeSubtitleId === sub.id}
                              onClick={() => setActiveSubtitleId(sub.id)}
                            >
                              {displaySubtitleLabel(sub.language)}
                            </PopoverItem>
                          ))}
                        </div>

                        {/* Subtitle Settings entry */}
                        {activeSubtitleId !== null && (setSubtitleOffsetSec || setSubtitleFontScale) && (
                          <div className="border-t border-ash/15 mt-1 pt-0.5">
                            <button
                              onClick={() => setSettingsSubMenu('subtitle-settings')}
                              className="w-full flex items-center justify-between gap-2 px-3 sm:px-3.5 py-1.5 sm:py-2 text-[11px] sm:text-[13px] lg:text-sm text-paper/60 hover:text-paper hover:bg-ash/20 transition-colors"
                            >
                              <span className="flex items-center gap-1.5">
                                Settings
                              </span>
                              <ChevronRight className="w-3.5 h-3.5 sm:w-4 sm:h-4 opacity-50" strokeWidth={2} />
                            </button>
                          </div>
                        )}
                      </>
                    )}
                  </>
                )}

                {settingsSubMenu === 'subtitle-settings' && (
                  /* ── Subtitle settings sub-panel ── */
                  <>
                    <SubPanelHeader label="Settings" onBack={() => setSettingsSubMenu('subtitles')} />

                    {/* Subtitle timing offset */}
                    {setSubtitleOffsetSec && (
                      <PopoverSection label="Timing">
                        <div className="flex items-center justify-center gap-1.5 sm:gap-3 px-3 sm:px-3.5 py-0.5 sm:py-1">
                          <button
                            onClick={() => setSubtitleOffsetSec(Math.round((subtitleOffsetSec - 0.5) * 10) / 10)}
                            className="flex items-center justify-center w-5 h-5 sm:w-6 sm:h-6 text-paper/80 hover:text-paper hover:bg-ash/20 transition-colors flex-shrink-0"
                            title="Shift earlier"
                          >
                            <Minus className="w-3 h-3 sm:w-3.5 sm:h-3.5" strokeWidth={2} />
                          </button>
                          <span className="text-[11px] sm:text-[13px] lg:text-sm text-paper tabular-nums w-10 sm:w-14 text-center">
                            {subtitleOffsetSec > 0 ? '+' : ''}{subtitleOffsetSec.toFixed(1)}s
                          </span>
                          <button
                            onClick={() => setSubtitleOffsetSec(Math.round((subtitleOffsetSec + 0.5) * 10) / 10)}
                            className="flex items-center justify-center w-5 h-5 sm:w-6 sm:h-6 text-paper/80 hover:text-paper hover:bg-ash/20 transition-colors flex-shrink-0"
                            title="Shift later"
                          >
                            <Plus className="w-3 h-3 sm:w-3.5 sm:h-3.5" strokeWidth={2} />
                          </button>
                        </div>
                        {subtitleOffsetSec !== 0 && (
                          <button
                            onClick={() => setSubtitleOffsetSec(0)}
                            className="w-full text-center pb-0.5 text-[9px] sm:text-[11px] lg:text-xs text-paper/50 hover:text-paper transition-colors"
                          >
                            Reset
                          </button>
                        )}
                      </PopoverSection>
                    )}

                    {/* Subtitle font size */}
                    {setSubtitleFontScale && (
                      <PopoverSection label="Size">
                        <div className="flex items-center mx-3 sm:mx-3.5 my-0.5 sm:my-1 border border-ash/20">
                          {[{ label: 'S', scale: 0.75 }, { label: 'M', scale: 1 }, { label: 'L', scale: 1.5 }].map(({ label, scale }, i) => (
                            <button
                              key={label}
                              onClick={() => setSubtitleFontScale(scale)}
                              className={`flex-1 py-0.5 sm:py-1 text-[10px] sm:text-[12px] lg:text-sm transition-colors ${i > 0 ? 'border-l border-ash/20' : ''} ${Math.abs(subtitleFontScale - scale) < 0.01 ? 'bg-blue-500/10 text-blue-400 font-medium' : 'text-paper hover:bg-ash/20'
                                }`}
                            >
                              {label}
                            </button>
                          ))}
                        </div>
                      </PopoverSection>
                    )}
                  </>
                )}
              </ControlPopover>
            )}
          </div>
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
            ? <Minimize className={ICON_PRIMARY} strokeWidth={1.5} />
            : <Maximize className={ICON_PRIMARY} strokeWidth={1.5} />}
        </Btn>
      </div>
    </div>
  );
};

