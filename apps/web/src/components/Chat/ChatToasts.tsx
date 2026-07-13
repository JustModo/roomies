import React, { useState, useEffect } from 'react';
import { useChat } from '../../contexts/ChatContext';
import { SystemIcon } from './SystemIcon';
import { getUsernameColor } from './utils';

/**
 * ChatToasts — minimal floating message overlay on the video player.
 *
 * No background at all — text uses a multi-layer shadow halo (subtitle-style)
 * so it stays readable over any video content on every screen size.
 * Rendered inside the video wrapper div so it overlays the player on
 * both mobile and desktop without fixed positioning.
 *
 * Hidden on mobile portrait — the chat panel is already visible below the video.
 */

// How many toasts to show at most — keeps the overlay tiny
const MAX_VISIBLE = 3;

/** Returns true when the device is portrait AND narrower than 1024px (mobile/tablet portrait) */
function useIsPortraitMobile(): boolean {
  const [isPortraitMobile, setIsPortraitMobile] = useState(() =>
    typeof window !== 'undefined'
      ? window.matchMedia('(orientation: portrait) and (max-width: 1023px)').matches
      : false
  );

  useEffect(() => {
    const mq = window.matchMedia('(orientation: portrait) and (max-width: 1023px)');
    const update = () => setIsPortraitMobile(mq.matches);
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);

  return isPortraitMobile;
}

export const ChatToasts: React.FC = () => {
  const { isOpen, setIsOpen, toasts } = useChat();
  const isPortraitMobile = useIsPortraitMobile();

  // Show only the most recent N non-exiting toasts
  const visible = toasts.filter((t) => !t.isExiting).slice(-MAX_VISIBLE);

  // Don't render on portrait mobile (chat panel is below the video anyway)
  if (isPortraitMobile || isOpen || visible.length === 0) return null;


  return (
    <div
      className="absolute bottom-20 left-4 z-40 pointer-events-none flex flex-col gap-0.5 max-w-[200px] sm:max-w-[260px] lg:max-w-[300px]"
      aria-live="polite"
    >
      {visible.map((toast, index) => {
        const prevToast = visible[index - 1];
        const isGrouped =
          index > 0 &&
          prevToast.username === toast.username &&
          !prevToast.isSystem &&
          !toast.isSystem;

        // Multi-layer text shadow — subtitle-style halo makes text readable
        // over any video content without any background at all.
        const halo: React.CSSProperties = {
          textShadow: '0 0 3px rgba(0,0,0,1), 0 0 6px rgba(0,0,0,0.9), 1px 1px 0 rgba(0,0,0,0.9), -1px -1px 0 rgba(0,0,0,0.9)',
        };

        return (
          <div
            key={toast.id}
            onClick={() => setIsOpen(true)}
            className="pointer-events-auto cursor-pointer px-1 py-0.5 transition-opacity duration-300"
            style={{ opacity: toast.isExiting ? 0 : 1 }}
          >
            {toast.isSystem ? (
              <span
                className="text-paper/70 text-[10px] sm:text-[11px] lg:text-[12px] tracking-wide uppercase flex items-center leading-tight"
                style={halo}
              >
                <SystemIcon type={toast.eventType} />
                {toast.body}
              </span>
            ) : (
              <div className="flex flex-col leading-tight">
                {!isGrouped && (
                  <span
                    className="text-[9px] sm:text-[10px] font-bold uppercase tracking-wider leading-none mb-0.5"
                    style={{ color: getUsernameColor(toast.username || 'unknown'), ...halo }}
                  >
                    {toast.username}
                  </span>
                )}
                <span
                  className="text-white text-[11px] sm:text-[13px] lg:text-[14px] leading-snug"
                  style={halo}
                >
                  {toast.body}
                </span>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};
