import React from 'react';
import { useChat, useChatAlerts } from './ChatContext';
import { SystemIcon } from './SystemIcon';
import { getUsernameColor } from './utils';
import { parseMentions } from './mentionUtils';
import { useSidebar } from '../room/SidebarContext';
import { usePresentation } from '../room/PresentationContext';

const MAX_VISIBLE = 5;

export const ChatToasts: React.FC = () => {
  const { toasts } = useChatAlerts();
  const { knownUsernames } = useChat();
  const { setOpen: setIsOpen, chatVisible: chatPanelVisible } = useSidebar();
  const { controlsVisible } = usePresentation();

  // Get the most recent active (non-exiting) toasts
  const activeToasts = toasts.filter((t) => !t.isExiting).slice(-MAX_VISIBLE);
  
  // Also include any toasts that are currently exiting (so they can animate their exit)
  const exitingToasts = toasts.filter((t) => t.isExiting);
  
  // Combine them, keeping original order
  const visible = toasts.filter((t) => activeToasts.includes(t) || exitingToasts.includes(t));

  const shown = chatPanelVisible ? [] : visible;

  return (
    <div
      className={`absolute left-4 z-40 pointer-events-none flex flex-col gap-0.5 max-w-[200px] sm:max-w-[260px] lg:max-w-[500px] transition-all duration-300 ${
        controlsVisible ? 'bottom-20 lg:bottom-24' : 'bottom-8'
      }`}
      aria-live="polite"
    >
      {shown.map((toast, index) => {
        const prevToast = index > 0 ? shown[index - 1] : null;
        const isGrouped =
          !!prevToast &&
          prevToast.username === toast.username &&
          !prevToast.isSystem &&
          !toast.isSystem;

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
              <div className="flex flex-col leading-tight">
                <span
                  className="text-paper/60 font-medium text-11 sm:text-11 lg:text-14 flex items-center wrap-break-word uppercase"
                  style={halo}
                >
                  <SystemIcon type={toast.eventType} />
                  {toast.username ? (
                    <span>
                      <span style={{ color: getUsernameColor(toast.username) }} className="font-bold ml-1 opacity-60">{toast.username}</span>
                      <span className="ml-1">{toast.body}</span>
                    </span>
                  ) : (
                    <span>{toast.body}</span>
                  )}
                </span>
              </div>
            ) : (
              <div className="flex flex-col leading-tight">
                <span
                  className="text-11 sm:text-11 lg:text-14 font-bold uppercase tracking-wider leading-none block"
                  style={{
                    color: getUsernameColor(toast.username || 'unknown'),
                    opacity: isGrouped ? 0 : 1,
                    maxHeight: isGrouped ? '0px' : '20px',
                    marginBottom: isGrouped ? '0px' : '1px',
                    overflow: 'hidden',
                    ...halo,
                  }}
                >
                  {toast.username}
                </span>
                <span
                  className="text-paper/60 text-11 sm:text-13 lg:text-20 leading-snug whitespace-pre-wrap line-clamp-3 wrap-break-word"
                  style={halo}
                >
                  {parseMentions(toast.body, knownUsernames).map((token, idx) => {
                    if (token.type === 'text') {
                      return <React.Fragment key={idx}>{token.content}</React.Fragment>;
                    }
                    return (
                      <span
                        key={idx}
                        className="font-bold uppercase tracking-wider text-11 sm:text-11 lg:text-14 inline opacity-70"
                        style={{
                          color: getUsernameColor(token.username),
                          ...halo,
                        }}
                      >
                        @{token.username}
                      </span>
                    );
                  })}
                </span>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

