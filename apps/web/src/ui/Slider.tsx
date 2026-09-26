import React from 'react';

interface SliderProps {
  value: number;
  max: number;
  onChange: (value: number) => void;
  label: string;
  className?: string;
}

export const Slider: React.FC<SliderProps> = ({ value, max, onChange, label, className = '' }) => (
  <input
    type="range"
    min={0}
    max={max}
    value={value}
    onChange={(e) => onChange(Number(e.target.value))}
    aria-label={label}
    title={label}
    className={`volume-slider w-full h-1 pointer-coarse:h-2 cursor-pointer appearance-none opacity-70 hover:opacity-100 transition-opacity ${className}`}
    style={{ '--fill': `${(value / max) * 100}%` } as React.CSSProperties}
  />
);
