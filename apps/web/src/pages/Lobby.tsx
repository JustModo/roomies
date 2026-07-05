import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Button } from '../components/ui/Button';
import { LogOut } from 'lucide-react';

export default function Lobby() {
  const { logout } = useAuth();
  const navigate = useNavigate();

  const [party, setParty] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/playback/party/active', {
      headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
    })
    .then(res => res.json())
    .then(data => {
      setParty(data);
    })
    .catch(err => console.error(err))
    .finally(() => setLoading(false));
  }, []);

  const status = party?.state === 'playing' ? 'WATCHING' : (party?.state === 'paused' ? 'PAUSED' : 'WAITING');
  const viewersCount = party?.viewersCount || 0;
  const currentMedia = party?.mediaTitle || 'Unknown';

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

          <Button onClick={() => navigate(`/room`)}>
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
