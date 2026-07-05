import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Button } from '../components/ui/Button';
import { HairlinePulse } from '../components/ui/HairlinePulse';
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
  const viewersCount = party?.viewers?.length || 0;
  const currentMedia = party?.media?.title || 'Unknown';
  const roomName = party?.name || 'Friday Movie Night';

  if (loading) return <div className="min-h-screen bg-void" />;

  return (
    <div className="min-h-screen bg-void flex flex-col relative">
      <HairlinePulse isLoading={loading} />

      <main className="flex-1 flex items-center justify-center p-4">
        <div className="w-full max-w-[480px] border-y border-ash py-12 flex flex-col items-center">
          <p className="text-14 font-semibold uppercase tracking-[0.08em] text-fog mb-6">
            ROOM
          </p>

          <h1 className="text-28 font-medium text-paper mb-10 text-center">
            {roomName}
          </h1>

          <div className="flex flex-col items-center gap-2 mb-10">
            <p className="text-14 text-paper uppercase tracking-[0.08em] flex items-center gap-2">
              <span className="font-mono text-16">{viewersCount}</span> WATCHING · {status}
            </p>
            {status !== 'WAITING' && (
              <p className="text-14 text-fog">
                Now: {currentMedia}
              </p>
            )}
          </div>

          <Button onClick={() => navigate(`/room?id=${party?.id || ''}`)}>
            JOIN
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
