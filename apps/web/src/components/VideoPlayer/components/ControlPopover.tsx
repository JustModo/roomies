import React from 'react';
import { Check } from 'lucide-react';

/**
 * Shared shell for all video-control dropdown menus (quality, subtitles, emoji).
 * Positioning (which edge it opens from) stays the caller's concern via `className` —
 * only the panel's visual language (background, border, sizing, scroll) is unified here.
 * No border-radius/box-shadow: the app enforces a global sharp/flat reset (index.css),
 * so definition against the video comes from the border + backdrop-blur alone.
 */
export const ControlPopover: React.FC<{ className?: string; children: React.ReactNode }> = ({ className = '', children }) => (
  <div
    className={`absolute z-50 bg-ink/95 backdrop-blur-md border border-ash/30 min-w-[150px] sm:min-w-[180px] max-w-[210px] sm:max-w-[240px] py-1 sm:py-1.5 ${className}`}
  >
    {children}
  </div>
);

export const PopoverSection: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div className="py-0.5 sm:py-1 first:pt-0">
    <div className="px-3 sm:px-3.5 pt-1 sm:pt-1.5 pb-1 sm:pb-1.5 text-[9px] sm:text-[10px] lg:text-xs text-paper/50 uppercase tracking-widest font-semibold border-b border-ash/10 mb-1">
      {label}
    </div>
    {children}
  </div>
);

export const PopoverItem: React.FC<{ active?: boolean; onClick: () => void; children: React.ReactNode }> = ({ active, onClick, children }) => (
  <button
    onClick={onClick}
    className={`w-full flex items-center justify-between gap-2 text-left pl-[10px] sm:pl-[12px] pr-3 sm:pr-3.5 py-1.5 sm:py-2 text-[11px] sm:text-[13px] lg:text-sm border-l-2 transition-colors ${
      active ? 'border-blue-500 text-blue-400 font-medium' : 'border-transparent text-paper hover:bg-ash/20'
    }`}
  >
    <span className="truncate">{children}</span>
    {active && <Check className="w-3.5 h-3.5 sm:w-4 sm:h-4 flex-shrink-0" strokeWidth={2} />}
  </button>
);

export const PopoverEmpty: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="px-3 sm:px-3.5 py-1.5 sm:py-2 text-[11px] sm:text-[13px] lg:text-sm text-paper/50 italic">{children}</div>
);
