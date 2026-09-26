import React from 'react';
import { X } from 'lucide-react';
import { IconButton } from '../../ui/IconButton';
import { useChatAlerts } from '../chat/ChatContext';
import { ChatSection } from '../chat/ChatSection';
import { PartySection } from '../voice/PartySection';
import { SettingsSection } from '../settings/SettingsSection';
import { SidebarTab, useSidebar } from './SidebarContext';

const TABS: { id: SidebarTab; label: string }[] = [
  { id: 'chat', label: 'CHAT' },
  { id: 'party', label: 'PARTY' },
  { id: 'settings', label: 'SETTINGS' },
];

export const Sidebar: React.FC = () => {
  const { isOpen, setOpen: setIsOpen, tab: activeTab, setTab: setActiveTab, docked } = useSidebar();
  const { unreadCount } = useChatAlerts();

  return (
    <div
      className={`z-45 flex-col bg-void ${
        docked ? 'flex relative flex-1 min-h-0 w-full border-t border-ash/10' : `${isOpen ? 'flex' : 'hidden'} relative shrink-0 h-full w-sidebar max-w-[50%] border-l border-ash/10 safe-b safe-t`
      }`}
      style={docked ? undefined : { paddingRight: 'env(safe-area-inset-right)' }}
    >
      {/* Header Tabs */}
      <div className="shrink-0 flex justify-between items-center px-4 border-b border-ash/10">
        <div role="tablist" aria-label="Sidebar" className="flex items-center gap-6">
          {TABS.map(({ id, label }) => (
            <button
              key={id}
              role="tab"
              aria-selected={activeTab === id}
              onClick={() => setActiveTab(id)}
              className={`relative py-2 pointer-coarse:py-3 text-12 font-semibold uppercase tracking-widest transition-colors ${
                activeTab === id ? 'text-paper' : 'text-paper/40 hover:text-paper/70'
              }`}
            >
              {label}
              {id === 'chat' && unreadCount > 0 && activeTab !== 'chat' && (
                <span
                  aria-label={`${unreadCount} unread`}
                  className="absolute top-0.5 -right-4 min-w-4 h-4 px-0.5 bg-accent text-11 flex items-center justify-center text-paper font-bold tracking-normal normal-case"
                >
                  {unreadCount > 99 ? '99+' : unreadCount}
                </span>
              )}
            </button>
          ))}
        </div>

        {!docked && <IconButton icon={<X size={16} strokeWidth={1.5} />} onClick={() => setIsOpen(false)} label="Close sidebar" />}
      </div>

      {/* Tab Content */}
      {activeTab === 'chat' && <ChatSection />}
      {activeTab === 'party' && <PartySection />}
      {activeTab === 'settings' && <SettingsSection />}
    </div>
  );
};
