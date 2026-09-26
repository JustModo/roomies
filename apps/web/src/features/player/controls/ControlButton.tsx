import React from 'react';
import { ICON_BTN_PADDING } from '../styleTokens';

interface ControlButtonProps {
  onClick?: () => void;
  disabled?: boolean;
  active?: boolean;
  important?: boolean;
  className?: string;
  title: string;
  children: React.ReactNode;
}

export const ControlButton: React.FC<ControlButtonProps> = ({ onClick, disabled, active, important, className = '', title, children }) => (
  <button
    onClick={onClick}
    disabled={disabled}
    title={title}
    aria-label={title}
    className={`flex items-center justify-center ${ICON_BTN_PADDING} bg-transparent border-none transition-colors duration-150 ${
      active ? 'text-paper' : important ? 'text-paper/90' : 'text-fog'
    } hover:text-paper disabled:opacity-30 disabled:cursor-not-allowed ${className}`}
  >
    {children}
  </button>
);
