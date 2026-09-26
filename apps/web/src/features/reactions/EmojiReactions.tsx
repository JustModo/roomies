import React, { useRef, useState } from 'react';
import { useDismiss } from '../../ui/useDismiss';
import { Smile } from 'lucide-react';
import { usePrefs } from '../settings/PrefsContext';
import { ControlPopover } from '../player/controls/ControlPopover';
import { useReactions } from './ReactionsContext';

export const ReactionColumn: React.FC<{ visible: boolean; short: boolean }> = ({ visible, short }) => {
  const { emojiPicker, emojiMuted } = usePrefs();
  const { send } = useReactions();
  if (emojiMuted) return null;

  return (
    <div
      className={`absolute top-1/2 -translate-y-1/2 z-40 flex flex-col items-center transition-opacity duration-200 ${short ? 'right-3' : 'left-1.5 sm:left-2 lg:left-3 gap-1.5 sm:gap-2'} ${
        visible ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
      }`}
    >
      {emojiPicker.map((emoji) => (
        <button
          key={emoji}
          onClick={() => send(emoji)}
          aria-label={`React ${emoji}`}
          className={`flex items-center justify-center opacity-80 hover:opacity-100 drop-shadow-lg duration-200 transition-all p-1.5 ${short ? 'text-xl' : 'sm:p-2 text-2xl sm:text-3xl'}`}
        >
          {emoji}
        </button>
      ))}
    </div>
  );
};

export const ReactionButton: React.FC<{ className?: string }> = ({ className = '' }) => {
  const { emojiPicker, emojiMuted } = usePrefs();
  const { send } = useReactions();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useDismiss([containerRef], () => setOpen(false), open);

  if (emojiMuted) return null;

  return (
    <div ref={containerRef} className="relative">
      <button onClick={() => setOpen((prev) => !prev)} title="Reactions" aria-expanded={open} className={className}>
        <Smile className="w-4 h-4 sm:w-5 sm:h-5" strokeWidth={1.5} />
      </button>
      {open && (
        <ControlPopover className="bottom-full right-0 mb-3">
          <div className="grid grid-cols-3 gap-1 p-1.5">
            {emojiPicker.map((emoji) => (
              <button
                key={emoji}
                onClick={() => send(emoji)}
                aria-label={`React ${emoji}`}
                className="flex items-center justify-center min-h-11 text-2xl hover:bg-ash/30 transition-colors duration-150"
              >
                {emoji}
              </button>
            ))}
          </div>
        </ControlPopover>
      )}
    </div>
  );
};
