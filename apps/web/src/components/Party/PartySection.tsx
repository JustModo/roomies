import React from 'react';

export const PartySection: React.FC = () => {
  return (
    <div className="flex-1 flex flex-col items-center justify-center p-4 text-center">
      <div className="w-16 h-16 bg-ash/10 rounded-full flex items-center justify-center mb-4">
        <span className="text-2xl">🎉</span>
      </div>
      <h3 className="text-paper text-lg font-medium mb-2">Party Mode</h3>
      <p className="text-paper/60 text-sm">
        This section is a placeholder for the upcoming Party features.
      </p>
    </div>
  );
};
