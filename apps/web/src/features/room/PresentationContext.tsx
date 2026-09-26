import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, ReactNode } from 'react';
import { useServices } from '../../app/ServicesProvider';
import { FULLSCREEN_OFF, FullscreenEvent, FullscreenState, fullscreenTransition } from './fullscreen';

interface WebkitDocument extends Document {
  webkitFullscreenElement?: Element | null;
  webkitExitFullscreen?: () => Promise<void> | void;
}

interface WebkitElement extends HTMLElement {
  webkitRequestFullscreen?: () => Promise<void> | void;
}

interface OrientationLock {
  lock?: (orientation: 'landscape') => Promise<void>;
  unlock?: () => void;
}

const FULLSCREEN_EVENTS = ['fullscreenchange', 'webkitfullscreenchange'] as const;

const fullscreenElement = () => {
  const doc = document as WebkitDocument;
  return doc.fullscreenElement ?? doc.webkitFullscreenElement ?? null;
};

async function requestElementFullscreen(el: HTMLElement | null): Promise<boolean> {
  const target = el as WebkitElement | null;
  try {
    if (target?.requestFullscreen) await target.requestFullscreen();
    else if (target?.webkitRequestFullscreen) await target.webkitRequestFullscreen();
    else return false;
    return true;
  } catch {
    return false;
  }
}

async function exitElementFullscreen() {
  const doc = document as WebkitDocument;
  try {
    if (doc.fullscreenElement) await doc.exitFullscreen();
    else if (doc.webkitFullscreenElement) await doc.webkitExitFullscreen?.();
  } catch {
    return;
  }
}

interface Presentation {
  isFullscreen: boolean;
  isPseudoFullscreen: boolean;
  toggleFullscreen: () => void;
  exitFullscreen: () => void;
  registerRoot: (el: HTMLElement | null) => void;
  controlsVisible: boolean;
  setControlsVisible: (visible: boolean) => void;
}

const PresentationContext = createContext<Presentation | null>(null);

export function PresentationProvider({ children }: { children: ReactNode }) {
  const { media } = useServices();
  const [fullscreen, setFullscreen] = useState<FullscreenState>(FULLSCREEN_OFF);
  const [controlsVisible, setControlsVisible] = useState(true);
  const stateRef = useRef(fullscreen);
  const rootRef = useRef<HTMLElement | null>(null);

  const dispatch = useCallback((event: FullscreenEvent) => {
    const { state, effects } = fullscreenTransition(stateRef.current, event);
    stateRef.current = state;
    setFullscreen(state);
    if (effects.pushHistory) window.history.pushState({ roomiesFullscreen: true }, '');
    if (effects.popHistory && window.history.state?.roomiesFullscreen) window.history.back();
    if (effects.exitElement) void exitElementFullscreen();
  }, []);

  useEffect(() => {
    const onChange = () => dispatch(fullscreenElement() ? 'elementEntered' : 'elementExited');
    const onPopState = () => dispatch('popstate');
    FULLSCREEN_EVENTS.forEach((e) => document.addEventListener(e, onChange));
    window.addEventListener('popstate', onPopState);
    return () => {
      FULLSCREEN_EVENTS.forEach((e) => document.removeEventListener(e, onChange));
      window.removeEventListener('popstate', onPopState);
    };
  }, [dispatch]);

  const isFullscreen = fullscreen.mode !== 'off';

  useEffect(() => {
    const orientation = (screen as Screen & { orientation?: OrientationLock }).orientation;
    if (isFullscreen) orientation?.lock?.('landscape').catch(() => {});
    else orientation?.unlock?.();
  }, [isFullscreen]);

  const toggleFullscreen = useCallback(async () => {
    if (stateRef.current.mode !== 'off') {
      dispatch('exitRequested');
      return;
    }
    const entered = media.elementFullscreen && (await requestElementFullscreen(rootRef.current));
    if (!entered) dispatch('pseudoEntered');
  }, [dispatch, media.elementFullscreen]);

  const exitFullscreen = useCallback(() => dispatch('exitRequested'), [dispatch]);
  const registerRoot = useCallback((el: HTMLElement | null) => {
    rootRef.current = el;
  }, []);

  const value = useMemo(
    () => ({
      isFullscreen,
      isPseudoFullscreen: fullscreen.mode === 'pseudo',
      toggleFullscreen: () => void toggleFullscreen(),
      exitFullscreen,
      registerRoot,
      controlsVisible,
      setControlsVisible,
    }),
    [isFullscreen, fullscreen.mode, toggleFullscreen, exitFullscreen, registerRoot, controlsVisible],
  );

  return <PresentationContext.Provider value={value}>{children}</PresentationContext.Provider>;
}

export function usePresentation() {
  const value = useContext(PresentationContext);
  if (!value) throw new Error('usePresentation must be used within a PresentationProvider');
  return value;
}
