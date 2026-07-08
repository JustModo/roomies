import React from 'react';

interface IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  icon: React.ReactNode;
  active?: boolean;
}

export const IconButton: React.FC<IconButtonProps> = ({ icon, active, className = '', ...props }) => {
  return (
    <button
      className={`
        flex items-center justify-center p-2 
        bg-transparent border-none
        transition-colors duration-150 ease-out
        ${active ? 'text-paper' : 'text-fog'}
        hover:text-paper
        disabled:opacity-30 disabled:cursor-not-allowed
        focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-paper focus-visible:ring-offset-2 focus-visible:ring-offset-void
        ${className}
      `}
      {...props}
    >
      {icon}
    </button>
  );
};
