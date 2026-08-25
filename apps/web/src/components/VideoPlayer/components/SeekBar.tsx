import React from 'react';
import { BufferedRange } from '../types';
import { BAR_EDGE_X } from '../styleTokens';

interface SeekBarProps {
  isLocked: boolean;
  bufferedRanges: BufferedRange[];
  progressPercent: number;
  totalDuration: number;
  isDragging: boolean;
  onPointerDown: (e: React.PointerEvent<HTMLDivElement>) => void;
  formatTime: (seconds: number) => string;
}

// Small viewfinder-style corner mark — purely decorative HUD framing.
const CornerTick: React.FC<{ side: 'left' | 'right' }> = ({ side }) => (
  <div
    className={`absolute top-0 ${side === 'left' ? 'left-0' : 'right-0'} w-2 h-2 pointer-events-none`}
    aria-hidden="true"
  >
    <div className={`absolute top-0 ${side === 'left' ? 'left-0' : 'right-0'} w-2 h-px bg-ash/40`} />
    <div className={`absolute top-0 ${side === 'left' ? 'left-0' : 'right-0'} w-px h-2 bg-ash/40`} />
  </div>
);

export const SeekBar = React.forwardRef<HTMLDivElement, SeekBarProps>(({
  isLocked,
  bufferedRanges,
  progressPercent,
  totalDuration,
  isDragging,
  onPointerDown,
  formatTime
}, ref) => {
  const [hoverPercent, setHoverPercent] = React.useState<number | null>(null);

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (isLocked) return;
    const rect = e.currentTarget.getBoundingClientRect();
    let pos = (e.clientX - rect.left) / rect.width;
    pos = Math.max(0, Math.min(1, pos));
    setHoverPercent(pos);
  };

  const handlePointerLeave = () => {
    setHoverPercent(null);
  };

  // When dragging, use progressPercent as the tooltip position. Otherwise use hover.
  const tooltipPercent = isDragging ? progressPercent / 100 : hoverPercent;
  const showTooltip = tooltipPercent !== null;

  return (
    <div className={`w-full py-3 sm:py-4 ${BAR_EDGE_X} relative select-none ${isLocked ? 'opacity-50' : ''}`}>
      <CornerTick side="left" />
      <CornerTick side="right" />

      <div
        ref={ref}
        className={`w-full h-[4px] hover:h-[6px] transition-all duration-100 bg-ash/40 relative flex items-center touch-none ${isLocked ? 'cursor-not-allowed' : 'cursor-pointer'}`}
        onPointerDown={isLocked ? undefined : onPointerDown}
        onPointerMove={isLocked ? undefined : handlePointerMove}
        onPointerLeave={isLocked ? undefined : handlePointerLeave}
      >
        {/* Tooltip */}
        <div
          className={`absolute bottom-full mb-3 text-center pointer-events-none transition-opacity duration-150 ${showTooltip ? 'opacity-100' : 'opacity-0'}`}
          style={{
            left: `${(tooltipPercent || 0) * 100}%`,
            transform: 'translateX(-50%)'
          }}
        >
          <div className="bg-ink/60 backdrop-blur-md border border-ash/20 text-paper text-[10px] sm:text-[11px] font-mono font-medium py-1 px-2.5 whitespace-nowrap tracking-wide">
            {formatTime((tooltipPercent || 0) * totalDuration)}
          </div>
        </div>

        {/* Buffered Ranges */}
        {bufferedRanges.map((range, i) => (
          <div
            key={i}
            className="h-full bg-paper/30 absolute top-0"
            style={{
              left: `${totalDuration > 0 ? (range.start / totalDuration) * 100 : 0}%`,
              width: `${totalDuration > 0 ? ((range.end - range.start) / totalDuration) * 100 : 0}%`
            }}
          />
        ))}

        {/* Played Progress */}
        <div className="h-full bg-blue-500 absolute top-0 left-0" style={{ width: `${progressPercent}%` }} />

        {/* Scrubber handle */}
        <div className={`w-[12px] h-[12px] bg-white absolute ml-[-6px] transition-transform ${isDragging || showTooltip ? 'scale-100' : 'scale-0'}`} style={{ left: `${progressPercent}%` }} />
      </div>
    </div>
  );
});
