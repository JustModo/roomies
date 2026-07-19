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
const MAX_VISIBLE = 5;

/** Returns true when the device is narrower than 1024px (mobile/tablet) */
function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== 'undefined'
      ? window.matchMedia('(max-width: 1023px)').matches
      : false
  );

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 1023px)');
    const update = () => setIsMobile(mq.matches);
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);

  return isMobile;
}

/** Returns true when the browser is in fullscreen mode. */
function useIsFullscreen(): boolean {
  const [isFs, setIsFs] = useState(() => !!document.fullscreenElement);

  useEffect(() => {
    const update = () => setIsFs(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', update);
    return () => document.removeEventListener('fullscreenchange', update);
  }, []);

  return isFs;
}

export const ChatToasts: React.FC = () => {
  const { isOpen, setIsOpen, toasts, activeTab } = useChat();
  const isMobile = useIsMobile();
  const isFullscreen = useIsFullscreen();
  const [controlsVisible, setControlsVisible] = useState(true);

  useEffect(() => {
    const handleToggle = (e: Event) => {
      const customEvent = e as CustomEvent<{ visible: boolean }>;
      setControlsVisible(customEvent.detail.visible);
    };
    window.addEventListener('player-controls-toggle', handleToggle);
    return () => {
      window.removeEventListener('player-controls-toggle', handleToggle);
    };
  }, []);

  // Get the most recent active (non-exiting) toasts
  const activeToasts = toasts.filter((t) => !t.isExiting).slice(-MAX_VISIBLE);
  
  // Also include any toasts that are currently exiting (so they can animate their exit)
  const exitingToasts = toasts.filter((t) => t.isExiting);
  
  // Combine them, keeping original order
  const visible = toasts.filter((t) => activeToasts.includes(t) || exitingToasts.includes(t));

  // Determine whether the chat panel is actually visible to the user right now.
  //
  // Fullscreen: the sidebar is entirely off-screen regardless of state → always show overlay.
  //
  // Mobile: the sidebar is always rendered. Hide the overlay when the chat tab is shown.
  //
  // Desktop: sidebar is behind an isOpen gate → hide the overlay only when open on chat tab.
  const chatPanelVisible =
    isFullscreen
      ? false
      : isMobile
        ? activeTab === 'chat'
        : isOpen && activeTab === 'chat';

  if (chatPanelVisible || visible.length === 0) return null;



  return (
    <div
      className={`absolute left-4 z-40 pointer-events-none flex flex-col gap-0.5 max-w-[200px] sm:max-w-[260px] lg:max-w-[500px] transition-all duration-300 ${
        controlsVisible ? 'bottom-16 lg:bottom-20' : 'bottom-8'
      }`}
      aria-live="polite"
    >
      {visible.map((toast, index) => {
        const prevToast = index > 0 ? visible[index - 1] : null;
        const isGrouped =
          !!prevToast &&
          prevToast.username === toast.username &&
          !prevToast.isSystem &&
          !toast.isSystem;

        // Multi-layer text shadow — subtitle-style halo makes text readable
        // over any video content without any background at all.
        const halo: React.CSSProperties = {
          textShadow: '0 0 3px rgba(0,0,0,1), 0 0 6px rgba(0,0,0,0.9), 1px 1px 0 rgba(0,0,0,0.9), -1px -1px 0 rgba(0,0,0,0.9)',
        };

        const normalPaddingY = isGrouped ? '0px' : '2px';
        const normalMarginTop = isGrouped ? '-2px' : '0px';

        return (
          <div
            key={toast.id}
            onClick={() => setIsOpen(true)}
            className="pointer-events-auto cursor-pointer px-1 transition-all duration-300"
            style={{
              opacity: toast.isExiting ? 0 : 1,
              maxHeight: toast.isExiting ? '0px' : '100px',
              paddingTop: toast.isExiting ? '0px' : normalPaddingY,
              paddingBottom: toast.isExiting ? '0px' : normalPaddingY,
              marginTop: toast.isExiting ? '0px' : normalMarginTop,
              overflow: 'hidden',
            }}
          >
            {toast.isSystem ? (
              <span
                className="text-paper/40 text-[9px] sm:text-[10px] lg:text-[14px] tracking-wide uppercase flex items-center leading-tight"
                style={halo}
              >
                <SystemIcon type={toast.eventType} />
                {toast.username ? (
                  <span>
                    <span style={{ color: getUsernameColor(toast.username), opacity: 0.7 }} className="font-bold">{toast.username}</span>
                    <span className="ml-1">{toast.body}</span>
                  </span>
                ) : (
                  <span>{toast.body}</span>
                )}
              </span>
            ) : (
              <div className="flex flex-col leading-tight">
                <span
                  className="text-[9px] sm:text-[10px] lg:text-[14px] font-bold uppercase tracking-wider leading-none block"
                  style={{
                    color: getUsernameColor(toast.username || 'unknown'),
                    opacity: isGrouped ? 0 : 1,
                    maxHeight: isGrouped ? '0px' : '20px',
                    marginBottom: isGrouped ? '0px' : '2px',
                    overflow: 'hidden',
                    ...halo,
                  }}
                >
                  {toast.username}
                </span>
                <span
                  className="text-paper/60 text-[11px] sm:text-[13px] lg:text-[20px] leading-snug"
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
