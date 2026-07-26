import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import EmojiPicker, { EmojiStyle, Theme } from 'emoji-picker-react';
import type { EmojiClickData } from 'emoji-picker-react';
import { createPortal } from 'react-dom';

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
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const gap = 10;
    const width = Math.min(pickerWidth, viewportWidth - 24);
    const height = Math.min(pickerHeight, viewportHeight - 24);

    let left = rect.left + rect.width / 2 - width / 2;
    let top = rect.top - height - gap;

    if (left + width > viewportWidth - 12) {
      left = viewportWidth - width - 12;
    }

    if (left < 12) {
      left = 12;
    }

    if (top < 12) {
      top = rect.bottom + gap;

      if (top + height > viewportHeight - 12) {
        top = Math.max(12, viewportHeight - height - 12);
      }
    }

    wrapper.style.top = `${top}px`;
    wrapper.style.left = `${left}px`;
    wrapper.style.width = `${width}px`;
    wrapper.style.maxWidth = `${width}px`;
    wrapper.style.maxHeight = `${height}px`;
    wrapper.style.transform = 'translate3d(0, 0, 0)';
  }, [pickerHeight, pickerWidth]);

  useEffect(() => {
    if (!showPicker) {
      return;
    }

    const handleClickOutside = (event: MouseEvent) => {
      if (buttonRef.current?.contains(event.target as Node)) {
        return;
      }

      if (pickerWrapperRef.current?.contains(event.target as Node)) {
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

  const pickerContent = showPicker
    ? createPortal(
        <div
          ref={pickerWrapperRef}
          role="dialog"
          aria-label="Emoji picker"
          data-video-controls
          className="pointer-events-auto fixed z-50 overflow-hidden"
          style={{
            top: 0,
            left: 0,
            width: `${pickerWidth}px`,
            maxWidth: 'calc(100vw - 24px)',
            height: `${pickerHeight}px`,
            maxHeight: 'calc(100vh - 24px)',
            transform: 'translate3d(0, 0, 0)',
            position: 'fixed',
            willChange: 'transform',
          }}
        >
          <div className="h-full w-full overflow-hidden rounded-[20px] border border-white/10 bg-[#111417]/95 shadow-[0_20px_60px_rgba(0,0,0,0.58)] backdrop-blur-xl">
            <EmojiPicker
              theme={Theme.DARK}
              emojiStyle={EmojiStyle.NATIVE}
              searchPlaceHolder="Search emoji"
              previewConfig={{ showPreview: false }}
              width={pickerWidth}
              height={pickerHeight}
              onEmojiClick={(data: EmojiClickData) => {
                onChange(data.emoji);
                setShowPicker(false);
              }}
              customEmojis={[]}
              reactions={[]}
            />
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
        className="flex h-12 w-12 items-center justify-center rounded-xl border border-white/10 bg-[#1b1f24]/80 text-2xl text-slate-100 transition-all duration-200 hover:border-sky-400/70 hover:bg-[#232830]"
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