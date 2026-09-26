import React from 'react';

interface IconButtonProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'title' | 'aria-label'> {
  icon: React.ReactNode;
  label: string;
}

export const IconButton: React.FC<IconButtonProps> = ({ icon, label, className = '', type = 'button', ...props }) => (
  <button
    type={type}
    aria-label={label}
    title={label}
    className={`flex items-center justify-center p-2 pointer-coarse:min-w-11 pointer-coarse:min-h-11 bg-transparent border-none transition-colors duration-150 ease-out text-fog hover:text-paper disabled:opacity-30 disabled:cursor-not-allowed ${className}`}
    {...props}
  >
    {icon}
  </button>
);
