import React, { lazy, Suspense, useCallback, useLayoutEffect, useRef, useState } from 'react';
import { useDismiss } from '../../ui/useDismiss';
import type { EmojiClickData, EmojiStyle, Theme } from 'emoji-picker-react';
import { createPortal } from 'react-dom';

const EmojiPicker = lazy(() => import('emoji-picker-react'));

interface EmojiSlotProps {
  index: number;
  emoji: string;
  onChange: (emoji: string) => void;
}

export const EmojiSlot: React.FC<EmojiSlotProps> = ({ index, emoji, onChange }) => {
  const [showPicker, setShowPicker] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const pickerWrapperRef = useRef<HTMLDivElement>(null);

  const pickerWidth = 340;
  const pickerHeight = 430;

  const positionPicker = useCallback(() => {
    const button = buttonRef.current;
    const wrapper = pickerWrapperRef.current;

    if (!button || !wrapper) {
      return;
    }

    const rect = button.getBoundingClientRect();
    const viewport = window.visualViewport;
    const viewportWidth = viewport?.width ?? window.innerWidth;
    const viewportHeight = viewport?.height ?? window.innerHeight;
    const viewportTop = viewport?.offsetTop ?? 0;
    const gap = 10;
    const width = Math.min(pickerWidth, viewportWidth - 24);
    const height = Math.min(pickerHeight, viewportHeight - 24);

    let left = rect.left + rect.width / 2 - width / 2;
    let top = rect.top - height - gap;
    const minTop = viewportTop + 12;

    if (left + width > viewportWidth - 12) {
      left = viewportWidth - width - 12;
    }

    if (left < 12) {
      left = 12;
    }

    if (top < minTop) {
      top = rect.bottom + gap;
      if (top + height > viewportTop + viewportHeight - 12) top = Math.max(minTop, viewportTop + viewportHeight - height - 12);
    }

    wrapper.style.top = `${top}px`;
    wrapper.style.left = `${left}px`;
    wrapper.style.width = `${width}px`;
    wrapper.style.height = `${height}px`;
  }, [pickerHeight, pickerWidth]);

  useDismiss([buttonRef, pickerWrapperRef], () => setShowPicker(false), showPicker);

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

  const pickerContent = showPicker
    ? createPortal(
        <div
          ref={pickerWrapperRef}
          role="dialog"
          aria-label="Emoji picker"
          className="pointer-events-auto fixed z-70 overflow-hidden"
          style={{ top: 0, left: 0, width: pickerWidth, height: pickerHeight }}
        >
          <div className="h-full w-full overflow-hidden border border-ash/30 bg-raise">
            <Suspense fallback={null}>
              <EmojiPicker
                theme={'dark' as Theme}
                emojiStyle={'native' as EmojiStyle}
                searchPlaceHolder="Search emoji"
                previewConfig={{ showPreview: false }}
                width="100%"
                height="100%"
                onEmojiClick={(data: EmojiClickData) => {
                  onChange(data.emoji);
                  setShowPicker(false);
                }}
                customEmojis={[]}
                reactions={[]}
              />
            </Suspense>
          </div>
        </div>,
        document.body
      )
    : null;

  return (
    <div className="relative inline-block">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setShowPicker((value) => !value)}
        className="flex h-12 w-12 items-center justify-center border border-paper/10 bg-raise/80 text-2xl text-paper transition-all duration-200 hover:border-accent/70 hover:bg-raise"
        aria-label={`Emoji slot ${index + 1}, current: ${emoji}`}
        aria-expanded={showPicker}
        aria-haspopup="dialog"
      >
        {emoji}
      </button>
      {pickerContent}
    </div>
  );
};