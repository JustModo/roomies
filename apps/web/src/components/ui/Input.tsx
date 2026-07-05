import React, { useId } from 'react';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string;
}

export const Input: React.FC<InputProps> = ({ label, className = '', ...props }) => {
  const id = useId();
  return (
    <div className={`flex flex-col gap-1 w-full ${className}`}>
      <label htmlFor={id} className="text-12 font-medium text-fog uppercase tracking-[0.08em]">
        {label}
      </label>
      <input
        id={id}
        className="w-full bg-transparent text-paper text-16 py-1 border-b border-ash placeholder:text-ash focus:outline-none focus:border-paper transition-colors duration-150 ease-out"
        {...props}
      />
    </div>
  );
};
