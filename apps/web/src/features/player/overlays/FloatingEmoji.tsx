import React, { useState } from 'react';
import { getUsernameColor } from '../../chat/utils';

interface FloatingEmojiProps {
  emoji: string;
  username: string;
  compact: boolean;
}

export function FloatingEmoji({ emoji, username, compact }: FloatingEmojiProps) {
  const [motion] = useState(() => ({
    right: compact ? 12 + Math.random() * 40 : 16 + Math.random() * 180,
    bottom: compact ? 4 + Math.random() * 8 : 12 + Math.random() * 56,
    driftX: (Math.random() - 0.5) * (compact ? 1.5 : 4),
    floatY: compact ? -7.5 : -20,
    duration: (compact ? 1600 : 2500) + Math.random() * (compact ? 400 : 800),
  }));

  return (
    <div
      className="absolute pointer-events-none z-40 flex flex-col items-center gap-0.5 px-3 py-2 text-16 font-medium whitespace-nowrap animate-float-up"
      style={
        {
          right: `${motion.right}px`,
          bottom: `${motion.bottom}px`,
          '--drift-x': `${motion.driftX}em`,
          '--float-y': `${motion.floatY}em`,
          '--duration': `${motion.duration}ms`,
        } as React.CSSProperties
      }
    >
      <span className={`leading-none select-none ${compact ? 'text-2xl' : 'text-3xl lg:text-4xl xl:text-5xl'}`}>{emoji}</span>
      <span
        className="text-11 lg:text-14 font-bold uppercase leading-none truncate max-w-30 text-center drop-shadow mt-0.5"
        style={{ color: getUsernameColor(username) }}
      >
        {username}
      </span>
    </div>
  );
}
