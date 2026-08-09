import { useEffect, useRef } from 'react';
import { absolutePlaybackTime } from '../hlsOffset';

interface UsePlayerGesturesParams {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  containerRef: React.RefObject<HTMLDivElement | null>;
  isLocked: boolean;
  playbackRate: number;
  volume: number;
  setVolume: (volume: number) => void;
  handlePlayPause: () => void;
  onSeek: (position: number) => void;
  onSetRate: (rate: number) => void;
  idle: boolean;
  showControls: () => void;
  hideControls: () => void;
  lastShowTimeRef: React.MutableRefObject<number>;
  mediaDuration: number;
  transcodeOffset: number;
}

const MOVE_CANCEL_PX = 10; // movement past this cancels a pending tap/hold
const HOLD_THRESHOLD_MS = 500;
const DOUBLE_TAP_WINDOW_MS = 250;

export function usePlayerGestures({
  videoRef,
  containerRef,
  isLocked,
  playbackRate,
  volume,
  setVolume,
  handlePlayPause,
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
  // Single tracked pointer — ignores extra fingers (pinch, accidental brush)
  const activePointerIdRef = useRef<number | null>(null);
  // Nulled once movement exceeds MOVE_CANCEL_PX, marking pointerup as "not a tap"
  const downPosRef = useRef<{ x: number; y: number } | null>(null);

  // Sync volatile state/callbacks to refs to prevent effect teardown
  const stateRef = useRef({
    playbackRate,
    volume,
    idle,
    mediaDuration,
    transcodeOffset,
    setVolume,
    handlePlayPause,
    onSeek,
    onSetRate,
    showControls,
    hideControls
  });
  
  useEffect(() => {
    stateRef.current = {
      playbackRate,
      volume,
      idle,
      mediaDuration,
      transcodeOffset,
      setVolume,
      handlePlayPause,
      onSeek,
      onSetRate,
      showControls,
      hideControls
    };
  });

  // Locking mid-gesture tears down the listeners below but refs survive — reset them so nothing gets stuck
  useEffect(() => {
    if (!isLocked) return;
    if (holdTimeoutRef.current) {
      clearTimeout(holdTimeoutRef.current);
      holdTimeoutRef.current = null;
    }
    if (clickTimeoutRef.current) {
      clearTimeout(clickTimeoutRef.current);
      clickTimeoutRef.current = null;
    }
    if (isHoldingRef.current) {
      isHoldingRef.current = false;
      stateRef.current.onSetRate(prevRateRef.current);
    }
    activePointerIdRef.current = null;
    downPosRef.current = null;
  }, [isLocked]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const isExcludedTarget = (target: HTMLElement) =>
      !!(
        target.closest('button') ||
        target.closest('input') ||
        target.closest('form') ||
        target.closest('.no-gestures')
      );

    // Clears in-flight hold/tap state for the tracked pointer without acting on it
    const resetPointerTracking = () => {
      activePointerIdRef.current = null;
      downPosRef.current = null;
      if (holdTimeoutRef.current) {
        clearTimeout(holdTimeoutRef.current);
        holdTimeoutRef.current = null;
      }
    };

    const handlePointerDown = (e: PointerEvent) => {
      if (isLocked) return;
      if (isExcludedTarget(e.target as HTMLElement)) return;
      if (e.pointerType === 'mouse' && e.button !== 0) return; // Only left click for mouse

      if (activePointerIdRef.current !== null) return; // extra finger — ignore

      activePointerIdRef.current = e.pointerId;
      downPosRef.current = { x: e.clientX, y: e.clientY };

      if (holdTimeoutRef.current) clearTimeout(holdTimeoutRef.current);
      holdTimeoutRef.current = setTimeout(() => {
        // Trigger 2x speed hold
        isHoldingRef.current = true;
        prevRateRef.current = stateRef.current.playbackRate || 1;
        stateRef.current.onSetRate(2);
      }, HOLD_THRESHOLD_MS);
    };

    const handlePointerMove = (e: PointerEvent) => {
      if (e.pointerId !== activePointerIdRef.current || !downPosRef.current) return;
      if (isHoldingRef.current) return; // already engaged — movement no longer cancels it

      const dx = e.clientX - downPosRef.current.x;
      const dy = e.clientY - downPosRef.current.y;
      if (Math.hypot(dx, dy) > MOVE_CANCEL_PX) {
        if (holdTimeoutRef.current) {
          clearTimeout(holdTimeoutRef.current);
          holdTimeoutRef.current = null;
        }
        downPosRef.current = null; // too far to be a tap — pointerup will bail
      }
    };

    const handlePointerCancel = (e: PointerEvent) => {
      if (e.pointerId !== activePointerIdRef.current) return;
      if (isHoldingRef.current) {
        isHoldingRef.current = false;
        stateRef.current.onSetRate(prevRateRef.current);
      }
      if (clickTimeoutRef.current) { // a cancel is never a real tap — drop any pending click too
        clearTimeout(clickTimeoutRef.current);
        clickTimeoutRef.current = null;
      }
      resetPointerTracking();
    };

    const handlePointerUp = (e: PointerEvent) => {
      if (isLocked) return;
      if (e.pointerId !== activePointerIdRef.current) return;

      const wasTap = downPosRef.current !== null;
      resetPointerTracking();

      if (isHoldingRef.current) {
        // Release 2x speed hold
        isHoldingRef.current = false;
        stateRef.current.onSetRate(prevRateRef.current);
        e.preventDefault();
        e.stopPropagation();
        return;
      }

      if (!wasTap) return; // drifted past the move threshold — a drag, not a tap

      if (isExcludedTarget(e.target as HTMLElement)) return;

      const rect = container.getBoundingClientRect();
      const xPercent = (e.clientX - rect.left) / rect.width;
      const isCenter = xPercent >= 0.3 && xPercent <= 0.7;

      if (isCenter) { // resolves immediately — no double-tap delay for play/pause
        if (clickTimeoutRef.current) {
          clearTimeout(clickTimeoutRef.current);
          clickTimeoutRef.current = null;
        }
        const wasHidden = stateRef.current.idle || (Date.now() - lastShowTimeRef.current < 500);
        if (wasHidden) {
          stateRef.current.showControls();
        } else {
          stateRef.current.handlePlayPause();
        }
        return;
      }

      // outer zones: single tap hides UI, double tap seeks ±10s
      if (clickTimeoutRef.current) {
        clearTimeout(clickTimeoutRef.current);
        clickTimeoutRef.current = null;

        const video = videoRef.current;
        if (video) {
          const currentAbsolute = absolutePlaybackTime(video.currentTime, stateRef.current.transcodeOffset);
          if (xPercent < 0.3) {
            stateRef.current.onSeek(Math.max(0, currentAbsolute - 10));
          } else {
            stateRef.current.onSeek(Math.min(stateRef.current.mediaDuration, currentAbsolute + 10));
          }
        }
      } else {
        clickTimeoutRef.current = setTimeout(() => {
          clickTimeoutRef.current = null;

          const wasHidden = stateRef.current.idle || (Date.now() - lastShowTimeRef.current < 500);
          if (wasHidden) {
            stateRef.current.showControls();
          } else {
            stateRef.current.hideControls();
          }
        }, DOUBLE_TAP_WINDOW_MS);
      }
    };

    const handleWheel = (e: WheelEvent) => {
      if (isLocked) return;

      const target = e.target as HTMLElement;
      if (
        target.closest('button') ||
        target.closest('input') ||
        target.closest('form') ||
        target.closest('.no-gestures') ||
        target.closest('[data-video-controls]') ||
        target.closest('.overflow-y-auto') ||
        target.closest('.overflow-auto') ||
        target.closest('.overflow-y-scroll')
      ) {
        return;
      }

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
    container.addEventListener('pointermove', handlePointerMove);
    container.addEventListener('pointerup', handlePointerUp);
    container.addEventListener('pointercancel', handlePointerCancel);
    container.addEventListener('wheel', handleWheel, { passive: false });

    return () => {
      container.removeEventListener('pointerdown', handlePointerDown);
      container.removeEventListener('pointermove', handlePointerMove);
      container.removeEventListener('pointerup', handlePointerUp);
      container.removeEventListener('pointercancel', handlePointerCancel);
      container.removeEventListener('wheel', handleWheel);
      if (clickTimeoutRef.current) clearTimeout(clickTimeoutRef.current);
      if (holdTimeoutRef.current) clearTimeout(holdTimeoutRef.current);
    };
  }, [isLocked, videoRef, containerRef, lastShowTimeRef]);
}
