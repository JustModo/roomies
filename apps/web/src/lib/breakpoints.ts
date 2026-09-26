import { useSyncExternalStore } from 'react';

export type Layout = 'column' | 'short' | 'desk';

export interface LayoutEnv {
  landscape: boolean;
  screenShortSide: number;
  viewportWidth: number;
}

const PHONE_MAX_SHORT_SIDE = 500;

export const isPhoneScreen = () => Math.min(screen.width, screen.height) <= PHONE_MAX_SHORT_SIDE;

export function layoutFor({ landscape, screenShortSide, viewportWidth }: LayoutEnv): Layout {
  if (landscape && screenShortSide <= PHONE_MAX_SHORT_SIDE) return 'short';
  if (landscape && viewportWidth >= 1024) return 'desk';
  return 'column';
}

const readLayout = (): Layout =>
  layoutFor({
    landscape: screen.orientation?.type ? screen.orientation.type.startsWith('landscape') : window.matchMedia('(orientation: landscape)').matches,
    screenShortSide: Math.min(screen.width, screen.height),
    viewportWidth: document.documentElement.clientWidth,
  });

const subscribe = (onChange: () => void) => {
  window.addEventListener('resize', onChange);
  screen.orientation?.addEventListener('change', onChange);
  return () => {
    window.removeEventListener('resize', onChange);
    screen.orientation?.removeEventListener('change', onChange);
  };
};

export function useLayout(): Layout {
  return useSyncExternalStore(subscribe, readLayout);
}
