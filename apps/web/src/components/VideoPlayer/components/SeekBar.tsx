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
  return (
    <div 
      className={`w-full pt-2 pb-1 px-2 sm:px-4 lg:px-6 relative ${isLocked ? 'cursor-not-allowed opacity-50' : 'cursor-pointer group'}`} 
      onPointerDown={isLocked ? undefined : onPointerDown}
    >
      <div ref={ref} className="w-full h-[4px] group-hover:h-[6px] transition-all duration-100 bg-ash/30 relative flex items-center rounded-full overflow-hidden group-hover:overflow-visible">
        
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
        <div className="h-full bg-blue-500 absolute top-0 left-0 shadow-[0_0_8px_rgba(59,130,246,0.8)]" style={{ width: `${progressPercent}%` }} />

        {/* Scrubber handle */}
        <div className={`w-[14px] h-[14px] bg-white rounded-full absolute ml-[-7px] shadow transition-transform ${isDragging ? 'scale-100' : 'scale-0 group-hover:scale-100'}`} style={{ left: `${progressPercent}%` }} />
      </div>
    </div>
  );
});
