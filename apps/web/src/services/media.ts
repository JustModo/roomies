export interface MediaCaps {
  elementFullscreen: boolean;
  canSetVolume: boolean;
  audioSession: boolean;
  wakeLock: boolean;
  standalone: boolean;
}

interface CapsEnvironment {
  document: Pick<Document, 'createElement'> & { fullscreenEnabled?: boolean; webkitFullscreenEnabled?: boolean };
  navigator: object & { standalone?: boolean };
  matchMedia: (query: string) => { matches: boolean };
}

export function detectCaps(env: CapsEnvironment = window as unknown as CapsEnvironment): MediaCaps {
  const probe = env.document.createElement('video');
  probe.volume = 0.5;
  return {
    elementFullscreen: Boolean(env.document.fullscreenEnabled || env.document.webkitFullscreenEnabled),
    canSetVolume: probe.volume === 0.5,
    audioSession: 'audioSession' in env.navigator,
    wakeLock: 'wakeLock' in env.navigator,
    standalone: env.matchMedia('(display-mode: standalone)').matches || env.navigator.standalone === true,
  };
}
