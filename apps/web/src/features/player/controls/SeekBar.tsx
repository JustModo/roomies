import React, { RefObject, useState } from 'react';
import { BufferedRange } from '../types';
import { BAR_EDGE_X } from '../styleTokens';
import { formatTime } from '../../../lib/time';
import { Store, useStoreValue } from '../../../lib/store';

interface SeekBarProps {
  barRef: RefObject<HTMLDivElement>;
  timeStore: Store<number>;
  pendingSeek: number | null;
  totalDuration: number;
  bufferedRanges: BufferedRange[];
  isLocked: boolean;
  isDragging: boolean;
  onPointerDown: (e: React.PointerEvent) => void;
}

const identity = (time: number) => time;

const CornerTick: React.FC<{ side: 'left' | 'right' }> = ({ side }) => (
  <div className={`absolute top-0 ${side === 'left' ? 'left-0' : 'right-0'} w-2 h-2 pointer-events-none`} aria-hidden="true">
    <div className={`absolute top-0 ${side === 'left' ? 'left-0' : 'right-0'} w-2 h-px bg-ash/40`} />
    <div className={`absolute top-0 ${side === 'left' ? 'left-0' : 'right-0'} w-px h-2 bg-ash/40`} />
  </div>
);

export const SeekBar: React.FC<SeekBarProps> = ({ barRef, timeStore, pendingSeek, totalDuration, bufferedRanges, isLocked, isDragging, onPointerDown }) => {
  const time = useStoreValue(timeStore, identity);
  const [hoverPercent, setHoverPercent] = useState<number | null>(null);
  const displayTime = pendingSeek ?? time;
  const progressPercent = totalDuration > 0 ? Math.min(100, (displayTime / totalDuration) * 100) : 0;
  const tooltipPercent = isDragging ? progressPercent / 100 : hoverPercent;
  const percentOf = (seconds: number) => (totalDuration > 0 ? (seconds / totalDuration) * 100 : 0);

  const handleHover = (e: React.PointerEvent) => {
    if (e.pointerType !== 'mouse') return;
    const rect = barRef.current?.getBoundingClientRect();
    if (rect && rect.width > 0) setHoverPercent(Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width)));
  };

  return (
    <div
      className={`group w-full py-2 sm:py-4 ${BAR_EDGE_X} relative select-none touch-none ${isLocked ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
      onPointerDown={isLocked ? undefined : onPointerDown}
      onPointerMove={isLocked ? undefined : handleHover}
      onPointerLeave={() => setHoverPercent(null)}
    >
      <CornerTick side="left" />
      <CornerTick side="right" />

      <div ref={barRef} className="w-full h-1 relative flex items-center">
        <div className="absolute inset-0 bg-ash/40 origin-center transition-transform duration-100 group-hover:scale-y-150">
          {bufferedRanges.map((range, i) => (
            <div
              key={i}
              className="h-full bg-paper/30 absolute top-0"
              style={{ left: `${percentOf(range.start)}%`, width: `${percentOf(range.end - range.start)}%` }}
            />
          ))}
          <div className="h-full bg-accent absolute top-0 left-0" style={{ width: `${progressPercent}%` }} />
        </div>

        <div
          className={`absolute bottom-full mb-3 pointer-events-none transition-opacity duration-150 ${tooltipPercent !== null ? 'opacity-100' : 'opacity-0'}`}
          style={{ left: `${(tooltipPercent ?? 0) * 100}%`, transform: 'translateX(-50%)' }}
        >
          <div className="bg-ink/60 backdrop-blur-md border border-ash/20 text-paper text-12 font-mono font-medium py-1 px-2.5 whitespace-nowrap tracking-wide">
            {formatTime((tooltipPercent ?? 0) * totalDuration)}
          </div>
        </div>

        <div
          className={`w-3 h-3 bg-paper absolute -ml-1.5 transition-transform pointer-coarse:scale-100 ${isDragging || tooltipPercent !== null ? 'scale-100' : 'scale-0'}`}
          style={{ left: `${progressPercent}%` }}
        />
      </div>
    </div>
  );
};
