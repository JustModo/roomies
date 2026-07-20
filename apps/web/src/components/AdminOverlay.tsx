import React, { useState, useEffect } from 'react';

import { X, Film, ChevronLeft, Play } from 'lucide-react';
import { Input } from './ui/Input';
import { IconButton } from './ui/IconButton';
import { Button } from './ui/Button';
import { Movie, MediaFile } from '@roomies/contracts';

interface AdminOverlayProps {
  isOpen: boolean;
  onClose: () => void;
  mediaTitle?: string | null;
}

type Tab = 'USERS' | 'MEDIA';

export const AdminOverlay: React.FC<AdminOverlayProps> = ({ isOpen, onClose, mediaTitle }) => {
  const [activeTab, setActiveTab] = useState<Tab>('MEDIA');

  if (!isOpen) return null;

  const handleStop = async () => {
    try {
      await fetch('/api/playback/stop', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });
    } catch (err) {
      console.error('Failed to stop media', err);
    }
  };

  return (
    <div className="fixed inset-0 bg-void z-50 flex flex-col">

      <div className="border-b border-ash flex justify-between items-center p-4 sm:p-6">
        <h1 className="text-16 sm:text-20 font-medium uppercase tracking-[0.08em] text-paper">
          MANAGE ROOM
        </h1>
        <IconButton icon={<X size={24} strokeWidth={1.5} />} onClick={onClose} />
      </div>

      {mediaTitle ? (
        <div className="bg-ash/5 px-4 sm:px-6 py-3 sm:py-4 flex items-center justify-between border-b border-ash/50">
          <div className="flex items-center gap-4 min-w-0">
            <div className="w-10 h-10 flex items-center justify-center text-blue-400 flex-shrink-0">
              <Play size={18} fill="currentColor" />
            </div>
            <div className="flex flex-col min-w-0">
              <span className="text-11 text-blue-400/80 font-semibold tracking-[0.15em] uppercase mb-1">Now Playing</span>
              <span className="text-14 sm:text-15 text-paper font-medium truncate w-full">{mediaTitle}</span>
            </div>
          </div>
          <button
            onClick={handleStop}
            className="font-semibold text-sm uppercase tracking-widest text-fog hover:text-red-400 transition-colors px-4 py-2"
          >
            Stop
          </button>
        </div>
      ) : (
        <div className="bg-ash/5 px-4 sm:px-6 py-3 sm:py-4 flex items-center justify-between border-b border-ash/50 opacity-60">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 rounded-full bg-ash/10 flex items-center justify-center text-fog flex-shrink-0">
              <Film size={18} />
            </div>
            <div className="flex flex-col">
              <span className="text-11 text-fog font-semibold tracking-[0.15em] uppercase mb-1">Status</span>
              <span className="text-14 sm:text-15 text-fog font-medium">No media selected</span>
            </div>
          </div>
        </div>
      )}

      <div className="border-b border-ash flex w-full">
        {(['MEDIA', 'USERS'] as Tab[]).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`
              flex-1 py-3 sm:py-4 text-12 sm:text-14 uppercase tracking-[0.1em] transition-colors duration-150 relative text-center
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

      <div className="flex-1 overflow-y-auto p-4 sm:p-6">
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
        body: JSON.stringify({ username: newUsername.trim(), password: newPassword })
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

  if (isCreating) {
    return (
      <div className="w-full">
        <div className="flex items-center gap-3 mb-6 sm:mb-8 w-full">
          <IconButton icon={<ChevronLeft size={20} strokeWidth={1.5} />} onClick={() => setIsCreating(false)} />
          <h2 className="text-14 sm:text-16 font-medium uppercase tracking-[0.08em] text-paper">NEW GUEST USER</h2>
        </div>

        <div className="flex flex-col gap-8 w-full max-w-sm bg-ash/5 border border-ash/15 p-6 sm:p-8 mx-auto mt-12">
          <div className="flex flex-col gap-4 w-full">
            <Input label="USERNAME" value={newUsername} onChange={(e) => setNewUsername(e.target.value)} autoComplete="off" />
            <Input label="PASSWORD" type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} autoComplete="new-password" />
            <Input label="CONFIRM PASSWORD" type="password" value={newConfirm} onChange={(e) => setNewConfirm(e.target.value)} autoComplete="new-password" />
          </div>

          <div className="flex flex-col w-full items-center gap-4 mt-2">
            {error && <span className="text-13 text-red-400">{error}</span>}
            <div className="flex w-full">
              <Button onClick={handleCreate} disabled={loading} className="w-full">CREATE</Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full flex flex-col items-center">
      <div className="flex justify-between items-center w-full mb-6 sm:mb-8">
        <h2 className="text-14 sm:text-16 font-medium uppercase tracking-[0.08em] text-paper">ALL USERS</h2>
        <Button onClick={() => setIsCreating(true)}>+ ADD USER</Button>
      </div>

      <div className="w-full">
        {users.length > 0 && (
          <div className="flex flex-col border border-ash/20 divide-y divide-ash/15 w-full">
            {users.map(u => (
              <div key={u.id} className="flex items-center justify-between p-3 sm:p-4.5 hover:bg-ash/5 transition-all duration-200 group w-full">
                <div className="flex items-center gap-3 sm:gap-6 min-w-0">
                  <div className="w-2 hidden sm:block" />
                  <div className="min-w-0">
                    <p className="text-14 sm:text-15 font-medium text-paper/85 truncate">{u.username}</p>
                    <p className="text-11 sm:text-12 text-fog/60 font-mono mt-1 lowercase">
                      {u.role === 'root' ? 'admin' : u.role} • joined {u.joined}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-4 pr-2">
                  {u.role !== 'root' && (
                    <button
                      onClick={() => handleDelete(u.id)}
                      className="text-12 font-medium tracking-wider text-fog group-hover:text-red-400 uppercase opacity-0 group-hover:opacity-100 transition-all duration-300 hover:scale-105"
                    >
                      REMOVE
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

const MediaTab = ({ onClose }: { onClose: () => void }) => {
  const [movies, setMovies] = useState<Movie[]>([]);
  const [isScanning, setIsScanning] = useState(false);
  const [selectedMovie, setSelectedMovie] = useState<Movie | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const formatDuration = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const fetchLibrary = () => {
    fetch('/api/library', {
      headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
    })
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data)) {
          const allMovies: Movie[] = data.flatMap((lib: any) => lib.movies || []);
          setMovies(allMovies);
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

  const handleMovieClick = (movie: Movie) => {
    if (movie.type === 'movie') {
      const mediaFileId = movie.mediaFiles[0]?.id;
      if (mediaFileId) handleStart(mediaFileId);
      return;
    }
    setSelectedMovie(movie);
  };

  if (selectedMovie) {
    const sortedEpisodes = [...selectedMovie.mediaFiles].sort((a, b) =>
      a.path.localeCompare(b.path, undefined, { numeric: true, sensitivity: 'base' })
    );

    return (
      <div className="w-full">
        <div className="flex items-center gap-3 mb-6 sm:mb-8 min-w-0">
          <div className="flex-shrink-0">
            <IconButton icon={<ChevronLeft size={20} strokeWidth={1.5} />} onClick={() => setSelectedMovie(null)} />
          </div>
          <h2 className="text-14 sm:text-16 font-medium uppercase tracking-[0.08em] text-paper truncate">{selectedMovie.name}</h2>
        </div>

        {sortedEpisodes.length > 0 && (
          <div className="flex flex-col border border-ash/20 divide-y divide-ash/15 w-full">
            {sortedEpisodes.map((mf: MediaFile) => {
              return (
                <div
                  key={mf.id}
                  className="flex items-center justify-between p-3 sm:p-4.5 hover:bg-ash/5 transition-all duration-200 group cursor-pointer w-full"
                  onClick={() => handleStart(mf.id)}
                >
                  <div className="flex items-center gap-3 sm:gap-6 min-w-0">
                    <div className="flex items-center justify-center w-6 h-6 transition-all duration-300 flex-shrink-0">
                      <Play
                        size={14}
                        className="text-fog group-hover:text-paper fill-current opacity-35 group-hover:opacity-100 scale-90 group-hover:scale-110 transition-all duration-300 ease-out"
                      />
                    </div>
                    <div className="min-w-0">
                      <p className="text-14 sm:text-15 font-medium text-paper/85 group-hover:text-paper transition-colors truncate">
                        {mf.title}
                      </p>
                      {mf.duration > 0 && (
                        <p className="text-11 sm:text-12 text-fog/60 font-mono mt-1">
                          {formatDuration(mf.duration)}
                        </p>
                      )}
                    </div>
                  </div>

                  <span className="hidden sm:block text-12 font-medium tracking-wider text-fog group-hover:text-paper uppercase opacity-0 group-hover:opacity-100 translate-x-2 group-hover:translate-x-0 transition-all duration-300 flex-shrink-0 ml-4">
                    PLAY NOW
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  const filteredMovies = movies.filter(m => m.name.toLowerCase().includes(searchQuery.toLowerCase()));

  return (
    <div className="w-full">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8">
        <Input 
          label="SEARCH MEDIA" 
          placeholder="Title..." 
          className="w-full sm:max-w-sm" 
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
        <Button onClick={handleScan} disabled={isScanning} className="w-full sm:w-auto min-w-[140px] flex-shrink-0">
          {isScanning ? 'SCANNING...' : 'SCAN'}
        </Button>
      </div>

      {filteredMovies.length === 0 && !isScanning && (
        <div className="flex flex-col items-center justify-center py-16 px-4 text-center border border-ash/20 border-dashed bg-ash/5 w-full">
          <div className="w-12 h-12 rounded-full bg-ash/10 flex items-center justify-center text-fog mb-4">
            <Film size={24} strokeWidth={1.5} />
          </div>
          <p className="text-15 font-medium text-paper mb-1">No media found</p>
          <p className="text-13 text-fog/70 max-w-sm">
            {searchQuery ? 'We couldn\'t find anything matching your search.' : 'Try scanning your library directory to import media.'}
          </p>
        </div>
      )}

      {filteredMovies.length > 0 && (
        <div className="flex flex-col border border-ash/20 divide-y divide-ash/15 w-full">
          {filteredMovies.map(m => (
            <div
              key={m.id}
              className="flex items-center justify-between p-3 sm:p-4.5 hover:bg-ash/5 transition-all duration-200 group cursor-pointer w-full"
              onClick={() => handleMovieClick(m)}
            >
              <div className="flex items-center gap-3 sm:gap-6 min-w-0">
                <div className="flex items-center justify-center w-6 h-6 transition-all duration-300 flex-shrink-0">
                  <Film
                    size={14}
                    className="text-fog group-hover:text-paper opacity-35 group-hover:opacity-100 scale-90 group-hover:scale-110 transition-all duration-300 ease-out"
                  />
                </div>
                <div className="min-w-0">
                  <p className="text-14 sm:text-15 font-medium text-paper/85 group-hover:text-paper transition-colors truncate">
                    {m.name}
                  </p>
                  <p className="text-11 sm:text-12 text-fog/60 font-mono mt-1 uppercase flex items-center gap-2">
                    <span>{m.type === 'show' ? `${m.mediaFiles.length} EPISODES` : 'MOVIE'}</span>
                    {m.type === 'movie' && m.mediaFiles[0]?.duration > 0 && (
                      <>
                        <span>•</span>
                        <span>{formatDuration(m.mediaFiles[0].duration)}</span>
                      </>
                    )}
                  </p>
                </div>
              </div>

              <span className="hidden sm:block text-12 font-medium tracking-wider text-fog group-hover:text-paper uppercase opacity-0 group-hover:opacity-100 translate-x-2 group-hover:translate-x-0 transition-all duration-300 flex-shrink-0 ml-4">
                {m.type === 'show' ? 'VIEW EPISODES' : 'PLAY NOW'}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

