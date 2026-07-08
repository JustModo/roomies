import React, { useState, useEffect } from 'react';

import { X, Film, ChevronLeft, Play } from 'lucide-react';
import { IconButton } from '../ui/IconButton';
import { Input } from '../ui/Input';
import { Button } from '../ui/Button';
import { Title, Season, MediaFile } from '@roomies/contracts';

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
      .catch(err => console.error('[library] Failed to fetch users:', err));
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
      console.error('[library] Failed to delete user:', err);
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

const CoverTile = ({ titleId, name, onClick }: { titleId: string; name: string; onClick: () => void }) => {
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | null = null;

    fetch(`/api/library/cover/${titleId}`, {
      headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
    })
      .then(res => {
        if (!res.ok) throw new Error('No cover');
        return res.blob();
      })
      .then(blob => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setSrc(objectUrl);
      })
      .catch(() => {});

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [titleId]);

  return (
    <button
      onClick={onClick}
      className="group relative aspect-square w-full overflow-hidden bg-ash text-left"
    >
      {src ? (
        <img src={src} alt="" className="absolute inset-0 w-full h-full object-cover" />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center">
          <Film size={32} strokeWidth={1.5} className="text-fog" />
        </div>
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-void via-void/10 to-transparent opacity-80 group-hover:opacity-95 transition-opacity" />
      <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
        <Play size={28} strokeWidth={1.5} className="text-paper" />
      </div>
      <span className="absolute bottom-2 left-2 right-2 text-14 font-medium text-paper truncate">
        {name}
      </span>
    </button>
  );
};

const MediaTab = ({ onClose }: { onClose: () => void }) => {
  const [titles, setTitles] = useState<Title[]>([]);
  const [isScanning, setIsScanning] = useState(false);
  const [selectedTitle, setSelectedTitle] = useState<Title | null>(null);

  const fetchLibrary = () => {
    fetch('/api/library', {
      headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
    })
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data)) {
          const allTitles: Title[] = data.flatMap((lib: any) => lib.titles || []);
          setTitles(allTitles);
        }
      })
      .catch(err => console.error('[library] Failed to fetch library:', err));
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
      console.error('[library] Failed to scan library:', err);
    } finally {
      setIsScanning(false);
    }
  };

  const handleStart = async (mediaFileId: string) => {
    try {
      const res = await fetch('/api/playback/change-media', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ mediaFileId })
      });
      if (!res.ok) {
        throw new Error('Failed to change media');
      }
      // NOTE: Close overlay. The media.changed event will update the player.
      onClose();
    } catch (err) {
      console.error('[playback] Failed to change media:', err);
    }
  };

  const handleTitleClick = (title: Title) => {
    if (title.type === 'movie') {
      const mediaFileId = title.seasons[0]?.mediaFiles[0]?.id;
      if (mediaFileId) handleStart(mediaFileId);
      return;
    }
    setSelectedTitle(title);
  };

  if (selectedTitle) {
    return (
      <div className="w-full">
        <div className="flex items-center gap-3 mb-8">
          <IconButton icon={<ChevronLeft size={20} strokeWidth={1.5} />} onClick={() => setSelectedTitle(null)} />
          <h2 className="text-16 font-medium uppercase tracking-[0.08em] text-paper">{selectedTitle.name}</h2>
        </div>

        <div className="flex flex-col gap-8">
          {selectedTitle.seasons.map((season: Season) => (
            <div key={season.id}>
              <h3 className="text-12 font-medium uppercase tracking-[0.08em] text-fog mb-4">
                {season.name || selectedTitle.name}
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
                {season.mediaFiles.map((mf: MediaFile) => (
                  <CoverTile key={mf.id} titleId={selectedTitle.id} name={mf.title} onClick={() => handleStart(mf.id)} />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="w-full">
      <div className="flex justify-between items-center mb-8">
        <Input label="SEARCH MEDIA" placeholder="Title..." className="max-w-sm w-full" />
        <Button onClick={handleScan} disabled={isScanning}>
          {isScanning ? 'SCANNING...' : 'SCAN MEDIA LIBRARY'}
        </Button>
      </div>

      {titles.length === 0 && !isScanning && (
        <p className="text-14 text-fog">No media found. Try scanning the library.</p>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
        {titles.map(t => (
          <CoverTile key={t.id} titleId={t.id} name={t.name} onClick={() => handleTitleClick(t)} />
        ))}
      </div>
    </div>
  );
};

