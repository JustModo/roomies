import { useCallback, useEffect, useLayoutEffect, useRef, useState, RefObject } from 'react';
import type React from 'react';

interface UseScrubParams {
  barRef: RefObject<HTMLElement>;
  totalDuration: number;
  isLocked: boolean;
  onPreview: (time: number) => void;
  onCommit: (time: number) => void;
}

export function useScrub({ barRef, totalDuration, isLocked, onPreview, onCommit }: UseScrubParams) {
  const [isDragging, setIsDragging] = useState(false);
  const latest = useRef({ totalDuration, onPreview, onCommit });
  useLayoutEffect(() => {
    latest.current = { totalDuration, onPreview, onCommit };
  });

  const timeAt = useCallback(
    (clientX: number) => {
      const rect = barRef.current?.getBoundingClientRect();
      if (!rect || rect.width === 0) return 0;
      return Math.min(1, Math.max(0, (clientX - rect.left) / rect.width)) * latest.current.totalDuration;
    },
    [barRef],
  );

  useEffect(() => {
    if (!isDragging) return;
    const onMove = (e: PointerEvent) => latest.current.onPreview(timeAt(e.clientX));
    const onUp = (e: PointerEvent) => {
      setIsDragging(false);
      latest.current.onCommit(timeAt(e.clientX));
    };
    const onCancel = () => setIsDragging(false);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onCancel);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onCancel);
    };
  }, [isDragging, timeAt]);

  const onPointerDown = (e: React.PointerEvent) => {
    if (isLocked || !totalDuration) return;
    setIsDragging(true);
    onPreview(timeAt(e.clientX));
  };

  return { isDragging, onPointerDown };
}
