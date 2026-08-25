import React from 'react';
import { SmilePlus } from 'lucide-react';
import { useFloatingEmojiPicker } from '../../hooks/useFloatingEmojiPicker';
import { EmojiPickerPortal } from '../shared/EmojiPickerPortal';

interface ChatEmojiButtonProps {
  onEmojiSelect: (emoji: string) => void;
}

export const ChatEmojiButton: React.FC<ChatEmojiButtonProps> = ({ onEmojiSelect }) => {
  const { showPicker, setShowPicker, triggerRef, wrapperRef, width, height } = useFloatingEmojiPicker({
    width: 320,
    height: 400,
  });

  return (
    <div className="relative hidden lg:inline-block">
      <button
        type="button"
        ref={triggerRef}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => setShowPicker((value) => !value)}
        className="p-1 mb-0.5 text-fog hover:text-paper transition-colors duration-150"
        aria-label="Insert emoji"
        aria-expanded={showPicker}
        aria-haspopup="dialog"
      >
        <SmilePlus size={15} strokeWidth={1.5} />
      </button>
      <EmojiPickerPortal
        show={showPicker}
        wrapperRef={wrapperRef}
        width={width}
        height={height}
        ariaLabel="Chat emoji picker"
        onEmojiClick={onEmojiSelect}
      />
    </div>
  );
};
