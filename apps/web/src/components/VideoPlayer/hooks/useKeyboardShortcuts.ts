import { useEffect } from 'react';

interface UseKeyboardShortcutsParams {
  handlePlayPause: () => void;
  handleSeekOffset: (offset: number) => void;
}

export function useKeyboardShortcuts({ handlePlayPause, handleSeekOffset }: UseKeyboardShortcutsParams) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      switch (e.key) {
        case ' ':
        case 'k':
        case 'K':
          e.preventDefault();
          handlePlayPause();
          break;
        case 'ArrowLeft':
          e.preventDefault();
          handleSeekOffset(-10);
          break;
        case 'ArrowRight':
          e.preventDefault();
          handleSeekOffset(10);
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handlePlayPause, handleSeekOffset]);
}
