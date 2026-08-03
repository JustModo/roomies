import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Smile } from 'lucide-react';
import { useChat, DEFAULT_EMOJI_PICKER } from '../../../contexts/ChatContext';
import { useMobileView } from '../../../hooks/useMobileView';
import { ControlPopover } from './ControlPopover';

export const EmojiReactions: React.FC<{ visible: boolean }> = ({ visible }) => {
  const { emojiPicker, emojiMuted, sendEmoji } = useChat();
  const { isMobile, isMobilePortrait } = useMobileView();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleEmojiClick = useCallback((emoji: string) => {
    sendEmoji(emoji);
    // Don't close picker - allow multiple emoji sends
  }, [sendEmoji]);

  useEffect(() => {
    if (!open) return;
    const handleOutside = (e: MouseEvent | TouchEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    document.addEventListener('touchstart', handleOutside);
    return () => {
      document.removeEventListener('mousedown', handleOutside);
      document.removeEventListener('touchstart', handleOutside);
    };
  }, [open]);

  if (emojiMuted) return null;

  const emojis = emojiPicker || DEFAULT_EMOJI_PICKER;

  if (isMobilePortrait) {
    return (
      <div
        ref={containerRef}
        className={`fixed bottom-24 right-4 z-40 transition-opacity duration-200 ${visible ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
      >
        <button
          onClick={() => setOpen((prev) => !prev)}
          title="Reactions"
          className="flex items-center justify-center p-2 text-fog hover:text-paper transition-colors duration-150"
        >
          <Smile className="w-5 h-5" strokeWidth={1.5} />
        </button>
        {open && (
          <ControlPopover className="bottom-full right-0 mb-3">
            <div className="grid grid-cols-6 gap-2 sm:gap-6 p-1.5 sm:p-2">
              {emojis.map((emoji) => (
                <button
                  key={emoji}
                  onClick={() => handleEmojiClick(emoji)}
                  className="flex items-center justify-center aspect-square text-sm sm:text-lg lg:text-xl hover:bg-ash/30 transition-colors duration-150"
                >
                  {emoji}
                </button>
              ))}
            </div>
          </ControlPopover>
        )}
      </div>
    );
  }

  // Mobile landscape must be sized explicitly (not via sm:/lg: breakpoints) —
  // many phones are wide enough in landscape to hit those width-based breakpoints
  // meant for tablet/desktop.
  const columnClass = isMobile
    ? 'right-3 -mt-1'
    : 'left-1.5 sm:left-2 lg:left-3 gap-1.5 sm:gap-2';
  const buttonClass = isMobile
    ? 'p-1.5 text-xl'
    : 'p-1.5 sm:p-2 text-2xl sm:text-3xl';

  return (
    <div
      className={`absolute top-1/2 -translate-y-1/2 z-40 flex flex-col items-center transition-opacity duration-200 ${columnClass} ${visible ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}
    >
      {emojis.map((emoji) => (
        <button
          key={emoji}
          onClick={() => handleEmojiClick(emoji)}
          className={`flex items-center justify-center opacity-80 hover:opacity-100 drop-shadow-lg duration-200 transition-all ${buttonClass}`}
        >
          {emoji}
        </button>
      ))}
    </div>
  );
};
