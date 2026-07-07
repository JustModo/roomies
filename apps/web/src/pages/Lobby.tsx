import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Button } from '../components/ui/Button';
import { LogOut } from 'lucide-react';
import { fetchApi } from '../api/client';
import { setHasUserInteracted } from './Room';

export default function Lobby() {
  const { logout } = useAuth();
  const navigate = useNavigate();

  const [activePlayback, setActivePlayback] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchApi('/playback/active')
      .then(data => {
        setActivePlayback(data);
      })
      .catch(err => console.error(err))
      .finally(() => setLoading(false));
  }, []);

  const status = activePlayback?.state === 'playing' ? 'WATCHING' : (activePlayback?.state === 'paused' ? 'PAUSED' : 'WAITING');
  const viewersCount = activePlayback?.viewersCount || 0;
  const currentMedia = activePlayback?.mediaTitle || 'Unknown';

  if (loading) return <div className="min-h-screen bg-void" />;

  return (
    <div className="min-h-screen bg-void flex flex-col relative">

      <main className="flex-1 flex items-center justify-center p-4">
        <div className="w-full max-w-[480px] flex flex-col items-center">
          <div className="flex items-center justify-center gap-3 mb-6">
            <div className="w-2 h-2 rounded-full bg-paper animate-pulse" />
            <h1 className="text-20 font-medium uppercase tracking-[0.08em] text-paper">
              LIVE ROOM
            </h1>
          </div>

          <div className="flex flex-col items-center gap-2 mb-8">
            <p className="text-14 text-fog uppercase tracking-[0.08em] flex items-center gap-2">
              <span className="font-mono text-16 text-paper">{viewersCount}</span> PEOPLE · {status}
            </p>
            {status !== 'WAITING' && (
              <p className="text-14 text-fog">
                Now: {currentMedia}
              </p>
            )}
          </div>

          <Button onClick={() => {
            setHasUserInteracted(true);
            navigate(`/room`);
          }}>
            JOIN ROOM
          </Button>
        </div>
      </main>

      <button
        onClick={logout}
        className="absolute bottom-6 right-6 flex items-center gap-2 text-12 text-fog lowercase hover:text-paper transition-colors duration-150"
      >
        sign out <LogOut size={14} className="ml-1" />
      </button>
    </div>
  );
}
