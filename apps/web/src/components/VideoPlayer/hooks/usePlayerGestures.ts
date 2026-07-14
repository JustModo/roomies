import { useEffect, useRef } from 'react';

interface UsePlayerGesturesParams {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  containerRef: React.RefObject<HTMLDivElement | null>;
  isLocked: boolean;
  isPlaying: boolean;
  playbackRate: number;
  isMuted: boolean;
  setIsMuted: (muted: boolean) => void;
  onPlay: () => void;
  onPause: () => void;
  onSeek: (position: number, isBuffered?: boolean) => void;
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
  isMuted,
  setIsMuted,
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
        prevRateRef.current = playbackRate || 1;
        onSetRate(2);
      }, 500); // 500ms long press threshold
    };

    const handlePointerUp = (e: PointerEvent) => {
      // Clear hold timeout if pointer is released before 500ms
      if (holdTimeoutRef.current) {
        clearTimeout(holdTimeoutRef.current);
        holdTimeoutRef.current = null;
      }

      if (isHoldingRef.current) {
        // Release 2x speed hold
        isHoldingRef.current = false;
        onSetRate(prevRateRef.current);
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
            const currentAbsolute = video.currentTime + transcodeOffset;
            const newPos = Math.max(0, currentAbsolute - 10);
            const isBuffered = Array.from({ length: video.buffered.length }, (_, i) => i)
              .some(i => newPos >= video.buffered.start(i) && newPos <= video.buffered.end(i));
            onSeek(newPos, isBuffered);
            video.currentTime = Math.max(0, newPos - transcodeOffset);
          }
        } else if (xPercent > 0.7) {
          // Double click right: Seek forward 10s
          const video = videoRef.current;
          if (video) {
            const currentAbsolute = video.currentTime + transcodeOffset;
            const newPos = Math.min(mediaDuration, currentAbsolute + 10);
            const isBuffered = Array.from({ length: video.buffered.length }, (_, i) => i)
              .some(i => newPos >= video.buffered.start(i) && newPos <= video.buffered.end(i));
            onSeek(newPos, isBuffered);
            video.currentTime = Math.max(0, newPos - transcodeOffset);
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
          const wasHidden = idle || (Date.now() - lastShowTimeRef.current < 500);

          if (wasHidden) {
            showControls();
          } else {
            if (xPercent >= 0.3 && xPercent <= 0.7) {
              // Single click center: Toggle Play/Pause
              if (isPlaying) {
                onPause();
              } else {
                onPlay();
              }
            } else {
              // Single click outer bounds: Hide UI
              hideControls();
            }
          }
        }, 250); // 250ms double-click window
      }
    };

    const handleWheel = (e: WheelEvent) => {
      // Prevent default scrolling of the page
      e.preventDefault();

      if (e.deltaY > 0) {
        // Scroll down: Mute
        setIsMuted(true);
      } else if (e.deltaY < 0) {
        // Scroll up: Unmute
        setIsMuted(false);
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
  }, [
    isLocked,
    isPlaying,
    playbackRate,
    isMuted,
    setIsMuted,
    onPlay,
    onPause,
    onSeek,
    onSetRate,
    idle,
    showControls,
    hideControls,
    lastShowTimeRef,
    mediaDuration,
    videoRef,
    containerRef
  ]);
}
