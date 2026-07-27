import { useEffect, useRef, useState } from 'react';
import { getUsernameColor } from '../../Chat/utils';

interface FloatingEmojiProps {
  emoji: string;
  username: string;
  onComplete: () => void;
}

export function FloatingEmoji({ emoji, username, onComplete }: FloatingEmojiProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(true);
  const instanceIdRef = useRef(Math.random().toString(36).slice(2, 11));
  const isMobilePortrait = useState(() => typeof window !== 'undefined' && window.innerWidth < 640)[0];
  const isMobileLandscape = useState(() => typeof window !== 'undefined' && window.innerWidth >= 640 && window.innerWidth < 1024 && window.innerHeight < 600)[0];
  const isMobile = isMobilePortrait || isMobileLandscape;
  const isTablet = useState(() => typeof window !== 'undefined' && window.innerWidth < 1024 && !isMobile)[0];

  const startRight = useState(() => isMobile ? (12 + Math.random() * 40) : (16 + Math.random() * 180))[0];
  const startBottom = useState(() => isMobile ? (4 + Math.random() * 8) : (12 + Math.random() * 56))[0];
  const driftX = useState(() => isMobile ? ((Math.random() - 0.5) * 1.5) : ((Math.random() - 0.5) * 4))[0];
  const floatY = useState(() => isMobileLandscape ? -9.5 : isMobilePortrait ? -6 : -20)[0];

  const duration = useState(() => {
    const base = isMobileLandscape ? 1750 : isMobilePortrait ? 1400 : isTablet ? 3000 : 2500;
    return base + Math.random() * (isMobile ? 400 : 800);
  })[0];

  const onCompleteRef = useRef(onComplete);
  const usernameColor = getUsernameColor(username);

  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    console.log(`[FloatingEmoji:${instanceIdRef.current}] START emoji="${emoji}" user="${username}" driftX=${driftX.toFixed(2)}em floatY=${floatY}em duration=${duration}ms`);

    const timer = setTimeout(() => {
      console.log(`[FloatingEmoji:${instanceIdRef.current}] Animation complete, hiding`);
      setIsVisible(false);
      setTimeout(() => {
        console.log(`[FloatingEmoji:${instanceIdRef.current}] Calling onComplete`);
        onCompleteRef.current();
      }, 100);
    }, duration);

    return () => {
      console.log(`[FloatingEmoji:${instanceIdRef.current}] Cleanup`);
      clearTimeout(timer);
    };
  }, [duration, driftX, floatY, emoji, username]);

  if (!isVisible) {
    console.log(`[FloatingEmoji:${instanceIdRef.current}] Not visible, returning null`);
    return null;
  }

  return (
    <div
      ref={containerRef}
      className="absolute pointer-events-none z-40 flex flex-col items-center gap-0.5
                 px-3 py-2 rounded-full text-lg font-medium whitespace-nowrap animate-float-up"
      data-emoji-instance={instanceIdRef.current}
      style={{
        right: `${startRight}px`,
        bottom: `${startBottom}px`,
        '--drift-x': `${driftX}em`,
        '--float-y': `${floatY}em`,
        '--duration': `${duration}ms`,
        willChange: 'transform, opacity',
      } as React.CSSProperties}
    >
      <span className="text-2xl sm:text-3xl md:text-4xl lg:text-4xl xl:text-5xl leading-none select-none">{emoji}</span>
      <span
        className="text-[9px] sm:text-[10px] lg:text-[14px] font-bold uppercase leading-none truncate max-w-30 text-center drop-shadow mt-0.5"
        style={{ color: usernameColor }}
      >
        {username.toUpperCase()}
      </span>
    </div>
  );
}