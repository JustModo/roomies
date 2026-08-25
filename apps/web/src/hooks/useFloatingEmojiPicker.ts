import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

interface FloatingEmojiPickerOptions {
  width?: number;
  height?: number;
}

export function useFloatingEmojiPicker<T extends HTMLElement = HTMLButtonElement>(
  { width = 340, height = 430 }: FloatingEmojiPickerOptions = {}
) {
  const [showPicker, setShowPicker] = useState(false);
  const triggerRef = useRef<T>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const positionPicker = useCallback(() => {
    const trigger = triggerRef.current;
    const wrapper = wrapperRef.current;

    if (!trigger || !wrapper) {
      return;
    }

    const rect = trigger.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const gap = 10;
    const w = Math.min(width, viewportWidth - 24);
    const h = Math.min(height, viewportHeight - 24);

    let left = rect.left + rect.width / 2 - w / 2;
    let top = rect.top - h - gap;

    if (left + w > viewportWidth - 12) {
      left = viewportWidth - w - 12;
    }

    if (left < 12) {
      left = 12;
    }

    if (top < 12) {
      top = rect.bottom + gap;

      if (top + h > viewportHeight - 12) {
        top = Math.max(12, viewportHeight - h - 12);
      }
    }

    wrapper.style.top = `${top}px`;
    wrapper.style.left = `${left}px`;
    wrapper.style.width = `${w}px`;
    wrapper.style.maxWidth = `${w}px`;
    wrapper.style.maxHeight = `${h}px`;
    wrapper.style.transform = 'translate3d(0, 0, 0)';
  }, [width, height]);

  useEffect(() => {
    if (!showPicker) {
      return;
    }

    const handleClickOutside = (event: MouseEvent) => {
      if (triggerRef.current?.contains(event.target as Node)) {
        return;
      }

      if (wrapperRef.current?.contains(event.target as Node)) {
        return;
      }

      setShowPicker(false);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setShowPicker(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside, true);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside, true);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [showPicker]);

  useLayoutEffect(() => {
    if (!showPicker) {
      return;
    }

    positionPicker();

    const handleResize = () => {
      positionPicker();
    };

    window.addEventListener('scroll', positionPicker, true);
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('scroll', positionPicker, true);
      window.removeEventListener('resize', handleResize);
    };
  }, [positionPicker, showPicker]);

  return { showPicker, setShowPicker, triggerRef, wrapperRef, width, height };
}
