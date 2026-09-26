import { useEffect, useLayoutEffect, useRef, RefObject } from 'react';

export function useDismiss(refs: RefObject<HTMLElement>[], onDismiss: () => void, enabled: boolean, ignore?: (target: Element) => boolean) {
  const latest = useRef({ refs, onDismiss, ignore });
  useLayoutEffect(() => {
    latest.current = { refs, onDismiss, ignore };
  });

  useEffect(() => {
    if (!enabled) return;
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Element;
      const { refs: inside, ignore: skip, onDismiss: dismiss } = latest.current;
      if (inside.some((ref) => ref.current?.contains(target)) || skip?.(target)) return;
      dismiss();
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') latest.current.onDismiss();
    };
    document.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [enabled]);
}
