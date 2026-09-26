import { useEffect } from 'react';

export function useWakeLock(active: boolean) {
  useEffect(() => {
    if (!active || !('wakeLock' in navigator)) return;
    let sentinel: WakeLockSentinel | null = null;
    let disposed = false;

    const acquire = () => {
      if (document.visibilityState !== 'visible' || (sentinel && !sentinel.released)) return;
      navigator.wakeLock
        .request('screen')
        .then((lock) => {
          if (disposed) void lock.release();
          else sentinel = lock;
        })
        .catch(() => undefined);
    };

    acquire();
    document.addEventListener('visibilitychange', acquire);
    return () => {
      disposed = true;
      document.removeEventListener('visibilitychange', acquire);
      void sentinel?.release();
    };
  }, [active]);
}
