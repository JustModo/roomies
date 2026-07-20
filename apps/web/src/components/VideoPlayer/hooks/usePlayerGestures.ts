import { useEffect, useRef } from 'react';

interface UsePlayerGesturesParams {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  containerRef: React.RefObject<HTMLDivElement | null>;
  isLocked: boolean;
  isPlaying: boolean;
  playbackRate: number;
  volume: number;
  setVolume: (volume: number) => void;
  onPlay: () => void;
  onPause: () => void;
  onSeek: (position: number) => void;
  onSetRate: (rate: number) => void;
  idle: boolean;
  showControls: () => void;
  hideControls: () => void;
  lastShowTimeRef: React.MutableRefObject<number>;
  mediaDuration: number;
  transcodeOffset: number;
}

export function usePlayerGestures({
  videoRef,
  containerRef,
  isLocked,
  isPlaying,
  playbackRate,
  volume,
  setVolume,
  onPlay,
  onPause,
  onSeek,
  onSetRate,
  idle,
  showControls,
  hideControls,
  lastShowTimeRef,
  mediaDuration,
  transcodeOffset,
}: UsePlayerGesturesParams) {
  const clickTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevRateRef = useRef<number>(1);
  const isHoldingRef = useRef<boolean>(false);
  const holdTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sync volatile state/callbacks to refs to prevent effect teardown
  const stateRef = useRef({
    isPlaying,
    playbackRate,
    volume,
    idle,
    mediaDuration,
    transcodeOffset,
    setVolume,
    onPlay,
    onPause,
    onSeek,
    onSetRate,
    showControls,
    hideControls
  });
  
  useEffect(() => {
    stateRef.current = {
      isPlaying,
      playbackRate,
      volume,
      idle,
      mediaDuration,
      transcodeOffset,
      setVolume,
      onPlay,
      onPause,
      onSeek,
      onSetRate,
      showControls,
      hideControls
    };
  });

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handlePointerDown = (e: PointerEvent) => {
      if (isLocked) return;

      const target = e.target as HTMLElement;
      // Skip if clicking inside buttons, inputs, seek bars, or overlay controls
      if (
        target.closest('button') ||
        target.closest('input') ||
        target.closest('form') ||
        target.closest('.no-gestures')
      ) {
        return;
      }

      // Check for Long Press (Hold to 2x speed)
      if (e.pointerType === 'mouse' && e.button !== 0) return; // Only left click for mouse

      // Clear any previous hold timeout
      if (holdTimeoutRef.current) clearTimeout(holdTimeoutRef.current);

      holdTimeoutRef.current = setTimeout(() => {
        // Trigger 2x speed hold
        isHoldingRef.current = true;
        prevRateRef.current = stateRef.current.playbackRate || 1;
        stateRef.current.onSetRate(2);
      }, 500); // 500ms long press threshold
    };

    const handlePointerUp = (e: PointerEvent) => {
      if (isLocked) return;
      // Clear hold timeout if pointer is released before 500ms
      if (holdTimeoutRef.current) {
        clearTimeout(holdTimeoutRef.current);
        holdTimeoutRef.current = null;
      }

      if (isHoldingRef.current) {
        // Release 2x speed hold
        isHoldingRef.current = false;
        stateRef.current.onSetRate(prevRateRef.current);
        e.preventDefault();
        e.stopPropagation();
        return;
      }

      const target = e.target as HTMLElement;
      if (
        target.closest('button') ||
        target.closest('input') ||
        target.closest('form') ||
        target.closest('.no-gestures')
      ) {
        return;
      }

      // Handle clicks (Single / Double click detection)
      const rect = container.getBoundingClientRect();
      const xPercent = (e.clientX - rect.left) / rect.width;

      if (clickTimeoutRef.current) {
        // Double click detected!
        clearTimeout(clickTimeoutRef.current);
        clickTimeoutRef.current = null;

        if (xPercent < 0.3) {
          // Double click left: Seek back 10s
          const video = videoRef.current;
          if (video) {
            const currentAbsolute = video.currentTime + stateRef.current.transcodeOffset;
            const newPos = Math.max(0, currentAbsolute - 10);
            stateRef.current.onSeek(newPos);
            video.currentTime = Math.max(0, newPos - stateRef.current.transcodeOffset);
          }
        } else if (xPercent > 0.7) {
          // Double click right: Seek forward 10s
          const video = videoRef.current;
          if (video) {
            const currentAbsolute = video.currentTime + stateRef.current.transcodeOffset;
            const newPos = Math.min(stateRef.current.mediaDuration, currentAbsolute + 10);
            stateRef.current.onSeek(newPos);
            video.currentTime = Math.max(0, newPos - stateRef.current.transcodeOffset);
          }
        } else {
          // Double click center: Toggle Fullscreen
          if (document.fullscreenElement) {
            document.exitFullscreen().catch(() => {});
          } else {
            document.documentElement.requestFullscreen().catch(() => {});
          }
        }
      } else {
        // Start single click timer
        clickTimeoutRef.current = setTimeout(() => {
          clickTimeoutRef.current = null;

          // If the UI was just woken up by this tap's touchstart within the last 500ms,
          // it means the UI was hidden before the tap. 
          // If idle is true, it means it's currently hidden.
          const wasHidden = stateRef.current.idle || (Date.now() - lastShowTimeRef.current < 500);

          if (wasHidden) {
            stateRef.current.showControls();
          } else {
            if (xPercent >= 0.3 && xPercent <= 0.7) {
              // Single click center: Toggle Play/Pause
              if (stateRef.current.isPlaying) {
                stateRef.current.onPause();
              } else {
                stateRef.current.onPlay();
              }
            } else {
              // Single click outer bounds: Hide UI
              stateRef.current.hideControls();
            }
          }
        }, 250); // 250ms double-click window
      }
    };

    const handleWheel = (e: WheelEvent) => {
      if (isLocked) return;
      // Prevent default scrolling of the page
      e.preventDefault();

      if (e.deltaY > 0) {
        // Scroll down: Volume down
        stateRef.current.setVolume(Math.max(0, stateRef.current.volume - 0.05));
      } else if (e.deltaY < 0) {
        // Scroll up: Volume up
        stateRef.current.setVolume(Math.min(1, stateRef.current.volume + 0.05));
      }
    };

    container.addEventListener('pointerdown', handlePointerDown);
    container.addEventListener('pointerup', handlePointerUp);
    container.addEventListener('wheel', handleWheel, { passive: false });

    return () => {
      container.removeEventListener('pointerdown', handlePointerDown);
      container.removeEventListener('pointerup', handlePointerUp);
      container.removeEventListener('wheel', handleWheel);
      if (clickTimeoutRef.current) clearTimeout(clickTimeoutRef.current);
      if (holdTimeoutRef.current) clearTimeout(holdTimeoutRef.current);
    };
  }, [isLocked, videoRef, containerRef, lastShowTimeRef]);
}
