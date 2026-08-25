import React from 'react';
import { createPortal } from 'react-dom';
import EmojiPicker, { EmojiStyle, Theme } from 'emoji-picker-react';
import type { EmojiClickData } from 'emoji-picker-react';

interface EmojiPickerPortalProps {
  show: boolean;
  wrapperRef: React.RefObject<HTMLDivElement>;
  width: number;
  height: number;
  ariaLabel: string;
  onEmojiClick: (emoji: string) => void;
}

export const EmojiPickerPortal: React.FC<EmojiPickerPortalProps> = ({
  show,
  wrapperRef,
  width,
  height,
  ariaLabel,
  onEmojiClick,
}) => {
  if (!show) {
    return null;
  }

  return createPortal(
    <div
      ref={wrapperRef}
      role="dialog"
      aria-label={ariaLabel}
      data-video-controls
      className="pointer-events-auto fixed z-50 overflow-hidden"
      style={{
        top: 0,
        left: 0,
        width: `${width}px`,
        maxWidth: 'calc(100vw - 24px)',
        height: `${height}px`,
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
          width={width}
          height={height}
          onEmojiClick={(data: EmojiClickData) => onEmojiClick(data.emoji)}
          customEmojis={[]}
          reactions={[]}
        />
      </div>
    </div>,
    document.body
  );
};
