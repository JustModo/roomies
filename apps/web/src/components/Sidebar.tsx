import React, { useRef, useEffect } from 'react';
import { X } from 'lucide-react';
import { IconButton } from './ui/IconButton';
import { useChat } from '../contexts/ChatContext';
import { RoomState } from '../hooks/useRoomSync';
import { ChatSection } from './Chat/ChatSection';
import { PartySection } from './Party/PartySection';
import { SettingsSection } from './Settings/SettingsSection';

interface SidebarProps {
  roomState: RoomState | null;
  updatePartyState: (updates: { isJoined?: boolean, micMuted?: boolean, videoMuted?: boolean }) => void;
  setControlLock: (userId: string, locked: boolean) => void;
  updateSettings?: (settings: { allowAsyncMode?: boolean }) => void;
  addMessageHandler: (handler: (msg: any) => void) => () => void;
  sendMessage: (msg: any) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ roomState, updatePartyState, updateSettings, setControlLock, addMessageHandler, sendMessage }) => {
  const { isOpen, setIsOpen, unreadCount, activeTab, setActiveTab } = useChat();
  const sidebarRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;

    const handleOutsideInteraction = (e: MouseEvent | TouchEvent) => {
      if (sidebarRef.current && !sidebarRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleOutsideInteraction);
    document.addEventListener('touchstart', handleOutsideInteraction);
    return () => {
      document.removeEventListener('mousedown', handleOutsideInteraction);
      document.removeEventListener('touchstart', handleOutsideInteraction);
    };
  }, [isOpen, setIsOpen]);

  return (
    <div
      ref={sidebarRef}
      className={`
        relative flex-1 min-h-0
        lg:fixed lg:top-0 lg:right-0 lg:w-[360px] lg:h-screen
        bg-void border-t border-ash/10
        lg:border-t-0 lg:border-l lg:border-ash/10
        z-45 shadow-2xl w-full flex flex-col
        ${!isOpen ? 'flex lg:hidden' : 'flex'}
      `}
    >
      {/* Header Tabs */}
      <div className="shrink-0 flex justify-between items-center px-4 py-2 border-b border-ash/10">
        <div className="flex items-center gap-6">
          <button
            onClick={() => setActiveTab('chat')}
            className={`relative text-12 font-semibold uppercase tracking-widest transition-colors ${
              activeTab === 'chat' ? 'text-paper' : 'text-paper/40 hover:text-paper/70'
            }`}
          >
            CHAT
            {unreadCount > 0 && activeTab !== 'chat' && (
              <span className="absolute -top-1 -right-3.5 min-w-[12px] h-[12px] px-0.5 rounded-full bg-blue-400 text-[9px] flex items-center justify-center text-white font-bold tracking-normal normal-case">
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab('party')}
            className={`text-12 font-semibold uppercase tracking-widest transition-colors ${
              activeTab === 'party' ? 'text-paper' : 'text-paper/40 hover:text-paper/70'
            }`}
          >
            PARTY
          </button>
          <button
            onClick={() => setActiveTab('settings')}
            className={`text-12 font-semibold uppercase tracking-widest transition-colors ${
              activeTab === 'settings' ? 'text-paper' : 'text-paper/40 hover:text-paper/70'
            }`}
          >
            SETTINGS
          </button>
        </div>

        {/* Close button — desktop only (mobile has no explicit close, use the player toggle) */}
        <div className="hidden lg:block">
          <IconButton icon={<X size={16} strokeWidth={1.5} />} onClick={() => setIsOpen(false)} />
        </div>
      </div>

      {/* Tab Content */}
      {activeTab === 'chat' && <ChatSection />}
      {activeTab === 'party' && <PartySection 
        roomState={roomState} 
        updatePartyState={updatePartyState} 
        setControlLock={setControlLock} 
        addMessageHandler={addMessageHandler}
        sendMessage={sendMessage}
      />}
      {activeTab === 'settings' && <SettingsSection roomState={roomState} updateSettings={updateSettings} />}
    </div>
  );
};
