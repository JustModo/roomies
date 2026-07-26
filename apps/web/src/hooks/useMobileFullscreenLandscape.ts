import { useState, useEffect } from 'react';

export function useMobileFullscreenLandscape(): boolean {
  const [isMobileFullscreenLandscape, setIsMobileFullscreenLandscape] = useState(false);

  useEffect(() => {
    const check = () => {
      const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
      const isLandscape = window.innerWidth > window.innerHeight;
      const isFullscreen = !!document.fullscreenElement;
      const isMobileViewport = window.innerWidth < 1024; // lg breakpoint

      // Mobile device + fullscreen + landscape + not desktop-width
      setIsMobileFullscreenLandscape(
        isTouchDevice && isFullscreen && isLandscape && isMobileViewport
      );
    };

    check();
    window.addEventListener('resize', check);
    document.addEventListener('fullscreenchange', check);

    return () => {
      window.removeEventListener('resize', check);
      document.removeEventListener('fullscreenchange', check);
    };
  }, []);

  return isMobileFullscreenLandscape;
}