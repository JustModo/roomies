import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { Button } from '../../ui/Button';
import { LogOut } from 'lucide-react';
import { useServices } from '../../app/ServicesProvider';
import { setHasUserInteracted } from '../room/userInteraction';
import { requestNotificationPermission } from '../chat/notify';
import { ActivePlaybackResponse } from '@roomies/contracts';

export default function Lobby() {
  const { logout } = useAuth();
  const { api } = useServices();
  const navigate = useNavigate();

  const [activePlayback, setActivePlayback] = useState<ActivePlaybackResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    api
      .request<ActivePlaybackResponse>('/playback/active', { signal: controller.signal })
      .then(setActivePlayback)
      .catch((err) => {
        if (!controller.signal.aborted) console.error('[playback] Failed to fetch active playback:', err);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [api]);

  const status = !activePlayback?.mediaTitle ? 'WAITING' : (activePlayback?.state === 'playing' ? 'PLAYING' : 'PAUSED');
  const viewersCount = activePlayback?.viewersCount || 0;

  if (loading) return <div className="min-h-dvh bg-void" />;

  return (
    <div className="min-h-dvh bg-void flex flex-col relative">

      <main className="flex-1 flex items-center justify-center p-4">
        <div className="w-full max-w-[480px] flex flex-col items-center">
          <div className="flex items-center justify-center gap-3 mb-6">
            <div className="w-2 h-2 bg-paper animate-pulse" />
            <h1 className="text-20 font-medium uppercase tracking-[0.08em] text-paper">
              LIVE ROOM
            </h1>
          </div>

          <div className="flex flex-col items-center gap-2 mb-8">
            <p className="text-14 text-fog uppercase tracking-[0.08em] flex items-center gap-2">
              <span className="font-mono text-16 text-paper">{viewersCount}</span> PEOPLE · {status}
            </p>
            {activePlayback?.mediaTitle && (
              <p className="text-14 text-fog">
                Now: {activePlayback.mediaTitle}
              </p>
            )}
          </div>

          <Button onClick={() => {
            setHasUserInteracted(true);
            requestNotificationPermission();
            navigate(`/room`);
          }}>
            JOIN ROOM
          </Button>
        </div>
      </main>

      <button
        onClick={logout}
        className="absolute top-[max(1.5rem,env(safe-area-inset-top))] right-[max(1.5rem,env(safe-area-inset-right))] md:top-8 md:right-8 flex items-center gap-2 text-12 text-fog uppercase tracking-[0.08em] hover:text-paper transition-colors duration-150 p-2"
      >
        sign out <LogOut size={14} />
      </button>
    </div>
  );
}
