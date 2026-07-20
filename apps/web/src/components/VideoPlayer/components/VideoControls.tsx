import React from 'react';
import { Play, Pause, RotateCcw, RotateCw, Volume2, VolumeX, Maximize, Minimize, MessageSquare, ClosedCaption } from 'lucide-react';
import { RoomState, MediaInfo } from '@roomies/contracts';
import { Level } from 'hls.js';
import { useActiveMenu } from '../../../hooks/useActiveMenu';
import { useChat } from '../../../contexts/ChatContext';

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
  isAsyncMode,
  onToggleAsync,
  allowAsyncMode = true,
}) => {
  const { activeMenu, setActiveMenu, toggleMenu, containerRef } = useActiveMenu<'quality' | 'subtitle'>();
  const { unreadCount } = useChat();

  const isPlaying = roomPlaybackState?.state === 'playing';

  return (
    <div className="flex items-center justify-between px-2 sm:px-4 lg:px-6 pt-1 pb-2 sm:pt-1 sm:pb-3 lg:pt-1 lg:pb-4 gap-1">
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
                    className={activeSubtitleId !== null ? '!text-blue-400' : ''}
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
