import { useState, useEffect } from 'react';

/**
 * Fullscreen detection that works on Safari.
 *
 * Three things differ from the standard API:
 *  - Safari exposes `webkitFullscreenElement`, not `fullscreenElement`.
 *  - Safari fires `webkitfullscreenchange`, not `fullscreenchange`.
 *  - iPhone has no element fullscreen at all; the only fullscreen is the native
 *    video overlay from `video.webkitEnterFullscreen()`, which reports itself
 *    via `webkitDisplayingFullscreen` and the `webkitbegin/endfullscreen` events.
 *
 * The app has a single <video>, so we look it up rather than threading a ref
 * through every consumer.
 */

interface WebkitDocument extends Document {
  webkitFullscreenElement?: Element | null;
}

interface WebkitVideo extends HTMLVideoElement {
  webkitDisplayingFullscreen?: boolean;
}

export function isFullscreenNow(): boolean {
  if (typeof document === 'undefined') return false;
  const doc = document as WebkitDocument;
  if (doc.fullscreenElement || doc.webkitFullscreenElement) return true;
  const video = document.querySelector('video') as WebkitVideo | null;
  return !!video?.webkitDisplayingFullscreen;
}

const FS_EVENTS = ['fullscreenchange', 'webkitfullscreenchange'] as const;
const VIDEO_FS_EVENTS = ['webkitbeginfullscreen', 'webkitendfullscreen'] as const;

/** Subscribe to fullscreen changes across the standard, webkit, and iPhone-video paths. */
export function onFullscreenChange(handler: () => void): () => void {
  FS_EVENTS.forEach((e) => document.addEventListener(e, handler));
  // The iPhone events fire on the <video> and do not bubble. Listening on
  // document in the *capture* phase still sees them, and — unlike binding the
  // element directly — does not depend on the video already being mounted.
  VIDEO_FS_EVENTS.forEach((e) => document.addEventListener(e, handler, true));

  return () => {
    FS_EVENTS.forEach((e) => document.removeEventListener(e, handler));
    VIDEO_FS_EVENTS.forEach((e) => document.removeEventListener(e, handler, true));
  };
}

interface WebkitElement extends HTMLElement {
  webkitRequestFullscreen?: () => Promise<void> | void;
}

interface WebkitExitDocument extends Document {
  webkitExitFullscreen?: () => Promise<void> | void;
}

interface WebkitEnterVideo extends HTMLVideoElement {
  webkitEnterFullscreen?: () => void;
  webkitExitFullscreen?: () => void;
}

/**
 * Try every fullscreen path in order of fidelity. Returns false when the
 * browser has none — iPhone Safari below 16.4 — so the caller can fall back to
 * a CSS pseudo-fullscreen layout.
 */
export async function requestFullscreen(container: HTMLElement | null): Promise<boolean> {
  const el = container as WebkitElement | null;
  try {
    if (el?.requestFullscreen) {
      await el.requestFullscreen();
      return true;
    }
    if (el?.webkitRequestFullscreen) {
      await el.webkitRequestFullscreen();
      return true;
    }
  } catch {
    // Denied or unsupported — fall through to the video-element path.
  }

  // iPhone: the native video overlay is the only fullscreen that exists.
  const video = document.querySelector('video') as WebkitEnterVideo | null;
  if (video?.webkitEnterFullscreen) {
    try {
      video.webkitEnterFullscreen();
      return true;
    } catch {
      // Throws if no media is loaded yet.
    }
  }
  return false;
}

export async function exitFullscreen(): Promise<void> {
  const doc = document as WebkitExitDocument;
  try {
    if (doc.fullscreenElement && doc.exitFullscreen) {
      await doc.exitFullscreen();
      return;
    }
    if ((doc as WebkitDocument).webkitFullscreenElement && doc.webkitExitFullscreen) {
      await doc.webkitExitFullscreen();
      return;
    }
    const video = document.querySelector('video') as WebkitEnterVideo | null;
    video?.webkitExitFullscreen?.();
  } catch {
    // Already exited, or the browser refused. Nothing useful to do.
  }
}

export function useIsFullscreen(): boolean {
  const [isFs, setIsFs] = useState(isFullscreenNow);

  useEffect(() => {
    const update = () => setIsFs(isFullscreenNow());
    update();
    return onFullscreenChange(update);
  }, []);

  return isFs;
}
