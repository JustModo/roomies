import React from 'react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  children: React.ReactNode;
}

export const Button: React.FC<ButtonProps> = ({ children, className = '', disabled, ...props }) => {
  return (
    <button
      disabled={disabled}
      className={`
        border border-paper bg-transparent text-paper 
        hover:bg-paper hover:text-ink
        disabled:border-ash disabled:text-ash disabled:bg-transparent disabled:hover:bg-transparent disabled:hover:text-ash
        uppercase tracking-[0.08em] font-medium text-14 
        py-2 px-4 transition-colors duration-150 ease-out flex items-center justify-center gap-2
        ${className}
      `}
      {...props}
    >
      {children}
    </button>
  );
};
