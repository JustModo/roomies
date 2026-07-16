import React from 'react';
import { BufferedRange } from '../types';

interface SeekBarProps {
  isLocked: boolean;
  bufferedRanges: BufferedRange[];
  progressPercent: number;
  totalDuration: number;
  isDragging: boolean;
  onPointerDown: (e: React.PointerEvent<HTMLDivElement>) => void;
}

export const SeekBar = React.forwardRef<HTMLDivElement, SeekBarProps>(({
  isLocked,
  bufferedRanges,
  progressPercent,
  totalDuration,
  isDragging,
  onPointerDown
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

  const formatTime = (seconds: number) => {
    if (isNaN(seconds) || seconds < 0) return '0:00';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  // When dragging, use progressPercent as the tooltip position. Otherwise use hover.
  const tooltipPercent = isDragging ? progressPercent / 100 : hoverPercent;
  const showTooltip = tooltipPercent !== null;

  return (
    <div 
      className={`w-full py-3 sm:py-4 px-2 sm:px-4 lg:px-6 relative touch-none select-none ${isLocked ? 'cursor-not-allowed opacity-50' : 'cursor-pointer group'}`} 
      onPointerDown={isLocked ? undefined : onPointerDown}
      onPointerMove={isLocked ? undefined : handlePointerMove}
      onPointerLeave={isLocked ? undefined : handlePointerLeave}
    >
      <div ref={ref} className="w-full h-[4px] group-hover:h-[6px] transition-all duration-100 bg-ash/40 relative flex items-center rounded-full">
        
        {/* Tooltip */}
        <div 
          className={`absolute bottom-full mb-3 text-center pointer-events-none transition-opacity duration-150 ${showTooltip ? 'opacity-100' : 'opacity-0'}`}
          style={{ 
            left: `${(tooltipPercent || 0) * 100}%`,
            transform: 'translateX(-50%)'
          }}
        >
          <div className="bg-ink/60 backdrop-blur-md border border-ash/20 text-paper text-[10px] sm:text-[11px] font-mono font-medium py-1 px-2.5 rounded shadow-xl whitespace-nowrap tracking-wide">
            {formatTime((tooltipPercent || 0) * totalDuration)}
          </div>
        </div>

        {/* Buffered Ranges */}
        {bufferedRanges.map((range, i) => (
          <div
            key={i}
            className="h-full bg-paper/30 absolute top-0 rounded-full"
            style={{
              left: `${totalDuration > 0 ? (range.start / totalDuration) * 100 : 0}%`,
              width: `${totalDuration > 0 ? ((range.end - range.start) / totalDuration) * 100 : 0}%`
            }}
          />
        ))}

        {/* Played Progress */}
        <div className="h-full bg-blue-500 absolute top-0 left-0 rounded-full shadow-[0_0_8px_rgba(59,130,246,0.5)]" style={{ width: `${progressPercent}%` }} />

        {/* Scrubber handle */}
        <div className={`w-[12px] h-[12px] bg-white rounded-full absolute ml-[-6px] shadow transition-transform ${isDragging || showTooltip ? 'scale-100' : 'scale-0'}`} style={{ left: `${progressPercent}%` }} />
      </div>
    </div>
  );
});
