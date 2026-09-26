import { useCallback, useEffect, useRef, useState } from 'react';
import type React from 'react';
import { isEditableTarget } from '../../../lib/keyboard';

const IDLE_MS = 3000;

export function useControlsVisibility() {
  const [idle, setIdle] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout>>();

  const show = useCallback(() => {
    setIdle(false);
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setIdle(true), IDLE_MS);
  }, []);

  const hide = useCallback(() => {
    clearTimeout(timerRef.current);
    setIdle(true);
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!isEditableTarget(e.target)) show();
    };
    window.addEventListener('keydown', onKeyDown);
    show();
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      clearTimeout(timerRef.current);
    };
  }, [show]);

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (e.pointerType === 'mouse') show();
    },
    [show],
  );

  return { idle, show, hide, onPointerMove };
}
