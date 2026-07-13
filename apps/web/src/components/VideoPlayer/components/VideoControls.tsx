import React, { useState } from 'react';
import { Play, Pause, RotateCcw, RotateCw, Volume2, VolumeX, Maximize, MessageSquare } from 'lucide-react';
import { IconButton } from '../../ui/IconButton';
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
}

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
  onToggleChat
}) => {
  const [showQualityMenu, setShowQualityMenu] = useState(false);

  return (
    <div className="flex items-center justify-between px-4 pb-3 pt-1">
      <div className="flex items-center gap-4">
        <IconButton disabled={isLocked} icon={roomPlaybackState?.state === 'playing' ? <Pause size={20} fill="currentColor" /> : <Play size={20} fill="currentColor" />} onClick={handlePlayPause} />
        <div className="flex items-center gap-2">
          <IconButton disabled={isLocked} icon={<RotateCcw size={18} strokeWidth={1.5} />} onClick={() => handleSeekOffset(-10)} />
          <IconButton disabled={isLocked} icon={<RotateCw size={18} strokeWidth={1.5} />} onClick={() => handleSeekOffset(10)} />
        </div>
        <div className="flex items-center group relative">
          <IconButton icon={isMuted ? <VolumeX size={18} strokeWidth={1.5} /> : <Volume2 size={18} strokeWidth={1.5} />} onClick={() => setIsMuted(!isMuted)} />
        </div>
        <div className="font-mono text-12 lg:text-14 text-paper ml-2 opacity-80">
          {formatTime(currentTime)} / {formatTime(totalDuration)}
        </div>
      </div>

      <div className="flex items-center gap-4 relative">
        <button disabled={isLocked} onClick={cyclePlaybackRate} className="text-12 lg:text-14 font-mono text-paper hover:text-fog transition-colors w-8 text-center opacity-80 hover:opacity-100 disabled:opacity-30 disabled:cursor-not-allowed">
          {roomPlaybackState?.playbackRate || 1}x
        </button>

        {/* Quality Selector */}
        {levels.length > 0 && (
          <div className="relative">
            <button
              onClick={() => setShowQualityMenu(!showQualityMenu)}
              className={`text-12 lg:text-14 font-mono transition-colors w-12 text-center ${currentLevel !== -1 ? 'text-blue-400 font-medium' : 'text-paper/80 hover:text-paper'}`}
            >
              {currentLevel === -1 ? 'AUTO' : `${levels[currentLevel]?.height}p`}
            </button>

            {showQualityMenu && (
              <div className="absolute bottom-full right-0 mb-4 bg-ink/95 backdrop-blur-md border border-ash/20 rounded-lg shadow-2xl py-2 min-w-[120px] overflow-hidden">
                <div className="px-4 py-2 text-[10px] text-paper/50 uppercase tracking-widest font-semibold border-b border-ash/10 mb-1">Quality</div>
                <button
                  onClick={() => { handleQualityChange(-1); setShowQualityMenu(false); }}
                  className={`w-full text-left px-4 py-2 text-12 lg:text-13 transition-colors ${currentLevel === -1 ? 'bg-blue-500/10 text-blue-400 font-medium' : 'text-paper hover:bg-ash/20'}`}
                >
                  Auto
                </button>
                {[...levels].reverse().map((level) => {
                  const originalIndex = levels.indexOf(level);
                  return (
                    <button
                      key={originalIndex}
                      onClick={() => { handleQualityChange(originalIndex); setShowQualityMenu(false); }}
                      className={`w-full text-left px-4 py-2 text-12 lg:text-13 transition-colors ${currentLevel === originalIndex ? 'bg-blue-500/10 text-blue-400 font-medium' : 'text-paper hover:bg-ash/20'}`}
                    >
                      {level.height}p
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {onToggleChat && (
          <IconButton
            icon={<MessageSquare size={18} strokeWidth={1.5} />}
            onClick={onToggleChat}
            active={showChat}
            className="hidden lg:flex"
          />
        )}

        <IconButton icon={<Maximize size={18} strokeWidth={1.5} />} onClick={() => {
          if (document.fullscreenElement) {
            document.exitFullscreen();
          } else {
            document.documentElement.requestFullscreen();
          }
        }} />
      </div>
    </div>
  );
};
