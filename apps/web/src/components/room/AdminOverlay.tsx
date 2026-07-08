import React, { useState, useEffect } from 'react';

import { X } from 'lucide-react';
import { IconButton } from '../ui/IconButton';
import { Input } from '../ui/Input';
import { Button } from '../ui/Button';

interface AdminOverlayProps {
  isOpen: boolean;
  onClose: () => void;
}

type Tab = 'USERS' | 'MEDIA';

export const AdminOverlay: React.FC<AdminOverlayProps> = ({ isOpen, onClose }) => {
  const [activeTab, setActiveTab] = useState<Tab>('MEDIA');

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-void z-50 flex flex-col">

      <div className="border-b border-ash flex justify-between items-center p-6">
        <h1 className="text-20 font-medium uppercase tracking-[0.08em] text-paper">
          MANAGE ROOM
        </h1>
        <IconButton icon={<X size={24} strokeWidth={1.5} />} onClick={onClose} />
      </div>

      <div className="border-b border-ash px-6 flex gap-8">
        {(['MEDIA', 'USERS'] as Tab[]).map((tab) => (
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

      <div className="flex-1 overflow-y-auto p-6">
        {activeTab === 'USERS' && <UsersTab />}
        {activeTab === 'MEDIA' && <MediaTab onClose={onClose} />}
      </div>
    </div>
  );
};

const UsersTab = () => {
  const [users, setUsers] = useState<any[]>([]);
  const [isCreating, setIsCreating] = useState(false);

  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newConfirm, setNewConfirm] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const fetchUsers = () => {
    fetch('/api/users', {
      headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
    })
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data)) setUsers(data);
      })
      .catch(console.error);
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const handleDelete = async (id: string) => {
    try {
      await fetch(`/api/users/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
      });
      fetchUsers();
    } catch (err) {
      console.error(err);
    }
  };

  const handleCreate = async () => {
    setError('');
    if (newPassword !== newConfirm) {
      setError('Passwords do not match');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch('/api/users/guest', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ username: newUsername, password: newPassword })
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to create user');
      }

      setIsCreating(false);
      setNewUsername('');
      setNewPassword('');
      setNewConfirm('');
      fetchUsers();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

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
                  onClick={() => handleDelete(u.id)}
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
                <Input label="USERNAME" value={newUsername} onChange={(e) => setNewUsername(e.target.value)} />
                <Input label="PASSWORD" type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
                <Input label="CONFIRM" type="password" value={newConfirm} onChange={(e) => setNewConfirm(e.target.value)} />
              </div>
              <div className="flex items-center justify-between">
                <div className="flex gap-4">
                  <span className="text-14 uppercase tracking-[0.08em] text-paper border-b border-paper pb-1">member</span>
                  <span className="text-14 uppercase tracking-[0.08em] text-fog cursor-not-allowed">admin</span>
                </div>
                <div className="flex items-center gap-4">
                  {error && <span className="text-14 text-paper">{error}</span>}
                  <button onClick={() => setIsCreating(false)} className="text-14 uppercase tracking-[0.08em] text-fog hover:text-paper">CANCEL</button>
                  <Button onClick={handleCreate} disabled={loading}>CREATE</Button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const MediaTab = ({ onClose }: { onClose: () => void }) => {
  const [media, setMedia] = useState<any[]>([]);
  const [isScanning, setIsScanning] = useState(false);


  const fetchLibrary = () => {
    fetch('/api/library', {
      headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
    })
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data)) {
          const allMedia = data.flatMap((lib: any) => lib.mediaFiles || []);
          setMedia(allMedia);
        }
      })
      .catch(console.error);
  };

  useEffect(() => {
    fetchLibrary();
  }, []);

  const handleScan = async () => {
    setIsScanning(true);
    try {
      await fetch('/api/library/scan', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({})
      });
      fetchLibrary();
    } catch (err) {
      console.error(err);
    } finally {
      setIsScanning(false);
    }
  };

  const handleStart = async (mediaId: string) => {
    try {
      const res = await fetch('/api/playback/change-media', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ mediaFileId: mediaId })
      });
      if (!res.ok) {
        throw new Error('Failed to change media');
      }
      // NOTE: Close overlay. The media.changed event will update the player.
      onClose();
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="w-full">
      <div className="flex justify-between items-center mb-8">
        <Input label="SEARCH MEDIA" placeholder="Title..." className="max-w-sm w-full" />
        <Button onClick={handleScan} disabled={isScanning}>
          {isScanning ? 'SCANNING...' : 'SCAN MEDIA LIBRARY'}
        </Button>
      </div>

      <div className="flex flex-col gap-4">
        {media.length === 0 && !isScanning && (
          <p className="text-14 text-fog">No media found. Try scanning the library.</p>
        )}
        {media.map(m => (
          <div key={m.id} className="group flex items-center justify-between py-4 border-b border-ash hover:bg-ash/20 transition-colors px-4 -mx-4">
            <div className="flex flex-col gap-1">
              <span className="text-16 text-paper font-medium">{m.title}</span>
              <span className="text-14 font-mono text-fog">
                {m.year || ''} {m.year && m.duration ? '·' : ''} {m.duration ? Math.floor(m.duration / 60) + ' min' : ''}
              </span>
            </div>
            <Button onClick={() => handleStart(m.id)}>
              PLAY
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
};

