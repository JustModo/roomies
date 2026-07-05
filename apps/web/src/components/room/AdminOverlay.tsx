import React, { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { IconButton } from '../ui/IconButton';
import { HairlinePulse } from '../ui/HairlinePulse';
import { Input } from '../ui/Input';
import { Button } from '../ui/Button';

interface AdminOverlayProps {
  isOpen: boolean;
  onClose: () => void;
}

type Tab = 'USERS' | 'MEDIA' | 'ROOM SETTINGS';

export const AdminOverlay: React.FC<AdminOverlayProps> = ({ isOpen, onClose }) => {
  const [activeTab, setActiveTab] = useState<Tab>('USERS');

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-void z-50 flex flex-col">
      <HairlinePulse />
      
      {/* Header */}
      <div className="border-b border-ash flex justify-between items-center p-6">
        <h1 className="text-20 font-medium uppercase tracking-[0.08em] text-paper">
          MANAGE ROOM
        </h1>
        <IconButton icon={<X size={24} strokeWidth={1.5} />} onClick={onClose} />
      </div>

      {/* Tabs */}
      <div className="border-b border-ash px-6 flex gap-8">
        {(['USERS', 'MEDIA', 'ROOM SETTINGS'] as Tab[]).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`
              py-4 text-14 uppercase tracking-[0.08em] transition-colors duration-150 relative
              ${activeTab === tab ? 'text-paper font-medium' : 'text-fog hover:text-paper'}
            `}
          >
            {tab}
            {activeTab === tab && (
              <div className="absolute bottom-0 left-0 w-full h-[1px] bg-paper" />
            )}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {activeTab === 'USERS' && <UsersTab />}
        {activeTab === 'MEDIA' && <MediaTab />}
        {activeTab === 'ROOM SETTINGS' && <RoomSettingsTab />}
      </div>
    </div>
  );
};

const UsersTab = () => {
  const [users, setUsers] = useState([
    { id: '1', username: 'alice', role: 'member', joined: '2026-04-02' },
    { id: '2', username: 'bram', role: 'member', joined: '2026-05-14' },
    { id: 'root', username: 'admin', role: 'root', joined: '2026-01-01' }
  ]);
  const [isCreating, setIsCreating] = useState(false);

  return (
    <div className="max-w-3xl">
      <div className="grid grid-cols-[2fr_1fr_1fr_auto] gap-4 mb-4 text-12 font-medium uppercase tracking-[0.08em] text-fog">
        <div>USERNAME</div>
        <div>ROLE</div>
        <div>JOINED</div>
        <div className="w-8"></div>
      </div>
      
      <div className="flex flex-col gap-4">
        {users.map(u => (
          <div key={u.id} className="grid grid-cols-[2fr_1fr_1fr_auto] gap-4 items-center">
            <div className="text-16 text-paper">{u.username}</div>
            <div className="text-14 text-paper lowercase">{u.role}</div>
            <div className="text-14 font-mono text-fog">{u.joined}</div>
            <div className="w-8 flex justify-end">
              {u.role !== 'root' && (
                <IconButton 
                  icon={<X size={16} strokeWidth={1.5} />} 
                  onClick={() => setUsers(users.filter(x => x.id !== u.id))} 
                />
              )}
            </div>
          </div>
        ))}

        <div className="mt-8 border-t border-ash pt-8">
          {!isCreating ? (
            <button 
              className="text-14 font-medium uppercase tracking-[0.08em] text-paper flex items-center gap-2 hover:text-fog transition-colors"
              onClick={() => setIsCreating(true)}
            >
              + NEW USER
            </button>
          ) : (
            <div className="flex flex-col gap-6 max-w-xl">
              <div className="grid grid-cols-3 gap-6">
                <Input label="USERNAME" />
                <Input label="PASSWORD" type="password" />
                <Input label="CONFIRM" type="password" />
              </div>
              <div className="flex items-center justify-between">
                <div className="flex gap-4">
                  <span className="text-14 uppercase tracking-[0.08em] text-paper border-b border-paper pb-1">member</span>
                  <span className="text-14 uppercase tracking-[0.08em] text-fog cursor-not-allowed">admin</span>
                </div>
                <div className="flex gap-4">
                  <button onClick={() => setIsCreating(false)} className="text-14 uppercase tracking-[0.08em] text-fog hover:text-paper">CANCEL</button>
                  <Button onClick={() => setIsCreating(false)}>CREATE</Button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const MediaTab = () => {
  const [media, setMedia] = useState<any[]>([]);

  useEffect(() => {
    fetch('/api/library', {
      headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
    })
    .then(res => res.json())
    .then(data => {
      if (Array.isArray(data)) setMedia(data);
    })
    .catch(console.error);
  }, []);

  const handleStart = async (mediaId: string) => {
    try {
      await fetch('/api/playback/start', {
        method: 'POST',
        headers: { 
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ mediaId })
      });
      // Optionally close overlay or refresh
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="max-w-3xl">
      <Input label="SEARCH MEDIA" placeholder="Title..." className="mb-8 max-w-sm" />
      <div className="flex flex-col gap-4">
        {media.map(m => (
          <div key={m.id} onClick={() => handleStart(m.id)} className="group flex items-center justify-between py-2 cursor-pointer border-b border-transparent hover:border-ash transition-colors">
            <div className="flex items-baseline gap-4">
              <span className="text-16 text-paper">{m.title}</span>
              <span className="text-14 font-mono text-fog">{m.year || ''}</span>
            </div>
            <span className="text-14 font-mono text-fog group-hover:text-paper transition-colors">{m.duration ? Math.floor(m.duration / 60) + ' min' : ''}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

const RoomSettingsTab = () => {
  return (
    <div className="max-w-xl flex flex-col gap-12">
      <Input label="ROOM NAME" defaultValue="Friday Movie Night" />
      
      <div className="pt-12 border-t border-ash">
        <button className="text-14 font-medium uppercase tracking-[0.08em] text-paper hover:bg-paper hover:text-ink border border-paper px-4 py-2 transition-colors">
          END SESSION FOR EVERYONE
        </button>
      </div>
    </div>
  );
};
