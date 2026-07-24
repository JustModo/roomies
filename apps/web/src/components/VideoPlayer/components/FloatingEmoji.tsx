import { useEffect, useRef, useState } from 'react';

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
  const driftX = useState(() => (Math.random() - 0.5) * 72)[0];
  const duration = useState(() => 2600 + Math.random() * 900)[0];
  const onCompleteRef = useRef(onComplete);

  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    console.log(`[FloatingEmoji:${instanceIdRef.current}] START emoji="${emoji}" user="${username}" driftX=${driftX.toFixed(1)}px duration=${duration}ms`);

    el.style.setProperty('--drift-x', `${driftX}px`);
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
      <span className="text-3xl">{emoji}</span>
      <span className="text-white/90 text-xs truncate max-w-30 text-center">{username}</span>
    </div>
  );
}