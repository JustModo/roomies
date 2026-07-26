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
  const instanceIdRef = useRef(Math.random().toString(36).substr(2, 9));
  const startRight = useState(() => 16 + Math.random() * 180)[0];
  const startBottom = useState(() => 12 + Math.random() * 56)[0];
  const driftX = useState(() => (Math.random() - 0.5) * 4)[0];
  const duration = useState(() => {
      // Duration scales with distance (20em) and desired velocity per breakpoint
      // Target: ~200-300px/s perceived velocity
      const isMobile = typeof window !== 'undefined' && window.innerWidth < 640;
      const isTablet = typeof window !== 'undefined' && window.innerWidth < 1024;
      // Mobile: 20em @ ~20px = 400px / 0.25px/ms = 1600ms base, but want slower feel
      // Desktop: 20em @ ~48px = 960px / 0.4px/ms = 2400ms base
      const base = isMobile ? 4500 : isTablet ? 3000 : 2500;
      return base + Math.random() * 800;
    })[0];
  const onCompleteRef = useRef(onComplete);
  const usernameColor = getUsernameColor(username);

  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    console.log(`[FloatingEmoji:${instanceIdRef.current}] START emoji="${emoji}" user="${username}" driftX=${driftX.toFixed(2)}em duration=${duration}ms`);

    el.style.setProperty('--drift-x', `${driftX}em`);
    el.style.setProperty('--duration', `${duration}ms`);

    // Trigger animation
    requestAnimationFrame(() => {
      el.classList.add('animate-float-up');
      console.log(`[FloatingEmoji:${instanceIdRef.current}] Animation class added`);
    });

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
  }, [duration, driftX, emoji, username]);

  if (!isVisible) {
    console.log(`[FloatingEmoji:${instanceIdRef.current}] Not visible, returning null`);
    return null;
  }

  return (
    <div
      ref={containerRef}
      className="absolute pointer-events-none z-40 flex flex-col items-center gap-1
                 px-3 py-2 rounded-full text-lg font-medium whitespace-nowrap
                 [animation-duration:var(--duration)]"
      data-emoji-instance={instanceIdRef.current}
      style={{
        right: `${startRight}px`,
        bottom: `${startBottom}px`,
        willChange: 'transform, opacity',
      }}
    >
      <span className="text-lg sm:text-xl md:text-3xl lg:text-4xl xl:text-5xl">{emoji}</span>
      <span className="text-xs truncate max-w-30 text-center" style={{ color: usernameColor }}>
        {username.toUpperCase()}
      </span>
    </div>
  );
}