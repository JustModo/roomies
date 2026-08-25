import React from 'react';
import { useFloatingEmojiPicker } from '../../hooks/useFloatingEmojiPicker';
import { EmojiPickerPortal } from '../shared/EmojiPickerPortal';

interface EmojiSlotProps {
  index: number;
  emoji: string;
  onChange: (emoji: string) => void;
}

export const EmojiSlot: React.FC<EmojiSlotProps> = ({ index, emoji, onChange }) => {
  const { showPicker, setShowPicker, triggerRef, wrapperRef, width, height } = useFloatingEmojiPicker();

  return (
    <div className="relative inline-block">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setShowPicker((value) => !value)}
        className="flex h-12 w-12 items-center justify-center rounded-xl border border-white/10 bg-[#1b1f24]/80 text-2xl text-slate-100 transition-all duration-200 hover:border-sky-400/70 hover:bg-[#232830]"
        aria-label={`Emoji slot ${index + 1}, current: ${emoji}`}
        aria-expanded={showPicker}
        aria-haspopup="dialog"
      >
        {emoji}
      </button>
      <EmojiPickerPortal
        show={showPicker}
        wrapperRef={wrapperRef}
        width={width}
        height={height}
        ariaLabel="Emoji picker"
        onEmojiClick={(selected) => {
          onChange(selected);
          setShowPicker(false);
        }}
      />
    </div>
  );
};
