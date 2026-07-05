import React from 'react';

interface HairlinePulseProps {
  hasError?: boolean;
  isLoading?: boolean;
}

export const HairlinePulse: React.FC<HairlinePulseProps> = ({ hasError = false, isLoading = false }) => {
  return (
    <div
      className={`hairline-pulse fixed top-0 left-0 w-full z-50 ${
        hasError ? 'error' : ''
      } ${isLoading ? 'loading' : ''}`}
      role="progressbar"
      aria-hidden="true"
    />
  );
};
