import { useState, useEffect } from 'react';
import { isFullscreenNow, onFullscreenChange } from './useIsFullscreen';

export interface MobileViewState {
  /** Mobile device in fullscreen + landscape (e.g. phone rotated in fullscreen video) */
  isMobileFullscreenLandscape: boolean;
  /** Mobile device in portrait orientation (non-fullscreen or fullscreen portrait) */
  isMobilePortrait: boolean;
  /** Any mobile orientation (portrait or fullscreen landscape) */
  isMobile: boolean;
}

export function useMobileView(): MobileViewState {
  const [state, setState] = useState<MobileViewState>({
    isMobileFullscreenLandscape: false,
    isMobilePortrait: false,
    isMobile: false,
  });

  useEffect(() => {
    const check = () => {
      const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
      const isLandscape = window.innerWidth > window.innerHeight;
      const isFullscreen = isFullscreenNow();
      const isMobileViewport = window.innerWidth < 1024; // lg breakpoint

      if (!isTouchDevice || !isMobileViewport) {
        setState({
          isMobileFullscreenLandscape: false,
          isMobilePortrait: false,
          isMobile: false,
        });
        return;
      }

      const isMobileFullscreenLandscape = isFullscreen && isLandscape;
      // Mobile portrait check for touch devices in portrait orientation.
      const isMobilePortrait = !isLandscape;

      setState({
        isMobileFullscreenLandscape,
        isMobilePortrait,
        isMobile: true,
      });
    };

    check();
    window.addEventListener('resize', check);
    window.addEventListener('orientationchange', check);
    const offFullscreen = onFullscreenChange(check);

    return () => {
      window.removeEventListener('resize', check);
      window.removeEventListener('orientationchange', check);
      offFullscreen();
    };
  }, []);

  return state;
}
