import React, { useState } from 'react';
import { X } from 'lucide-react';
import { IconButton } from './ui/IconButton';
import { useChat } from '../contexts/ChatContext';
import { ChatSection } from './Chat/ChatSection';
import { PartySection } from './Party/PartySection';

type Tab = 'chat' | 'party';

export const Sidebar: React.FC = () => {
  const { isOpen, setIsOpen } = useChat();
  const [activeTab, setActiveTab] = useState<Tab>('chat');

  return (
    <div
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
        <div className="flex items-center gap-4">
          <button
            onClick={() => setActiveTab('chat')}
            className={`text-12 font-semibold uppercase tracking-widest transition-colors ${
              activeTab === 'chat' ? 'text-paper' : 'text-paper/40 hover:text-paper/70'
            }`}
          >
            CHAT
          </button>
          <button
            onClick={() => setActiveTab('party')}
            className={`text-12 font-semibold uppercase tracking-widest transition-colors ${
              activeTab === 'party' ? 'text-paper' : 'text-paper/40 hover:text-paper/70'
            }`}
          >
            PARTY
          </button>
        </div>

        {/* Close button — desktop only (mobile has no explicit close, use the player toggle) */}
        <div className="hidden lg:block">
          <IconButton icon={<X size={16} strokeWidth={1.5} />} onClick={() => setIsOpen(false)} />
        </div>
      </div>

      {/* Tab Content */}
      {activeTab === 'chat' && <ChatSection />}
      {activeTab === 'party' && <PartySection />}
    </div>
  );
};
