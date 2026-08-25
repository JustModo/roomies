import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Smile } from 'lucide-react';
import { useChat, DEFAULT_EMOJI_PICKER } from '../../contexts/ChatContext';

/**
 * Floating circular button shown above the chat send area in mobile portrait.
 * Opens a vertical emoji-reaction popup. Stays open for multiple sends (mass spam),
 * closes on button toggle or click outside.
 */
export const FloatingReactionButton: React.FC = () => {
  const { emojiPicker, emojiMuted, sendEmoji } = useChat();
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleEmojiClick = useCallback((emoji: string) => {
    sendEmoji(emoji);
    // Keep popup open — allow mass spam of reactions
  }, [sendEmoji]);

  // Close on click outside
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent | TouchEvent) => {
      const target = e.target as Node;
      if (containerRef.current && !containerRef.current.contains(target)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('touchstart', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, [isOpen]);

  return (
    <div
      ref={containerRef}
      className="absolute bottom-15 z-50"
      style={{ right: '0', width: '80px' }}
    >
      {/* Vertical popup — centered on container */}
      {isOpen && !emojiMuted && (
        <div className="absolute bottom-[calc(100%+8px)] left-1/2 -translate-x-1/2 flex flex-col gap-1 p-2 bg-ink/95 backdrop-blur-md border border-ash/30 rounded-lg shadow-2xl animate-fade-in min-w-20">
          {(emojiPicker || DEFAULT_EMOJI_PICKER).map((emoji) => (
            <button
              key={emoji}
              onClick={() => handleEmojiClick(emoji)}
              className="p-2 text-2xl hover:bg-ash/30 hover:scale-110 active:scale-95 transition-all duration-150 rounded"
            >
              {emoji}
            </button>
          ))}
        </div>
      )}

      {/* Floating circular button — centered on container */}
      <button
        disabled={emojiMuted}
        onClick={() => !emojiMuted && setIsOpen((v) => !v)}
        className={`w-12 h-12 shrink-0 flex items-center justify-center bg-ink/95 backdrop-blur-md transition-all duration-200 mx-auto ${
          emojiMuted ? 'text-paper/30 cursor-not-allowed opacity-30' : 'text-paper hover:text-blue-400 active:scale-95'
        }`}
        style={{
          clipPath: 'circle(50%)',
        }}
        title={emojiMuted ? 'Reactions muted' : 'Reactions'}
      >
        <Smile className="w-6 h-6" strokeWidth={1.5} />
      </button>
    </div>
  );
};
