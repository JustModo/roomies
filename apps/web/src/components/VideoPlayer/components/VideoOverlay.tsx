import React, { useEffect, useState } from 'react';
import { MediaInfo, RoomState } from '@roomies/contracts';

const LONG_SYNC_MS = 3000;

interface VideoOverlayProps {
  mediaInfo: MediaInfo | null;
  roomPlaybackState?: RoomState['playback'];
  isPlaying: boolean;
  isDragging: boolean;
  isAsyncMode: boolean;
  isAtEnd: boolean;
  onForceResume?: () => void;
  formatTime: (seconds: number) => string;
  errorText?: string | null;
}

export const VideoOverlay: React.FC<VideoOverlayProps> = ({
  mediaInfo,
  roomPlaybackState,
  isPlaying,
  isDragging,
  isAsyncMode,
  isAtEnd,
  onForceResume,
  formatTime,
  errorText
}) => {
  const isSyncing = Boolean(mediaInfo) && !errorText && !isAsyncMode && roomPlaybackState?.state === 'buffering';
  const [isLongSync, setIsLongSync] = useState(false);

  useEffect(() => {
    setIsLongSync(false);
    if (!isSyncing) return;
    const timer = setTimeout(() => setIsLongSync(true), LONG_SYNC_MS);
    return () => clearTimeout(timer);
  }, [isSyncing, roomPlaybackState?.anchorTime]);

  let overlayText = '';
  if (errorText && mediaInfo) {
    overlayText = errorText;
  } else if (!mediaInfo) {
    overlayText = 'THE PARTY WILL START SOON';
  } else if (roomPlaybackState?.state === 'buffering') {
    overlayText = isAsyncMode ? 'BUFFERING' : 'SYNCING';
  } else if (isAtEnd && !isPlaying) {
    overlayText = 'THE END';
  } else if (roomPlaybackState?.state === 'paused' || roomPlaybackState?.state === 'waiting' || (!isPlaying && !isDragging)) {
    overlayText = 'PAUSED';
  }

  const showOverlay = Boolean(overlayText) && !isDragging;
  const seekTarget = showOverlay && roomPlaybackState?.state === 'buffering' && roomPlaybackState.action === 'seek' ? roomPlaybackState.anchorPosition : null;

  return (
    <div
      className={`absolute inset-0 bg-ink/60 z-20 flex flex-col items-center justify-center gap-3 pointer-events-none transition-opacity duration-300 ${
        showOverlay ? 'opacity-100' : 'opacity-0'
      }`}
    >
      <h2 className={`text-sm lg:text-3xl font-medium tracking-[0.12em] text-paper/80 animate-pulse drop-shadow-lg text-center px-6 ${mediaInfo ? 'uppercase' : ''}`}>
        {overlayText}
      </h2>
      {seekTarget !== null && (
        <p className="text-xs lg:text-sm tracking-[0.08em] text-paper/60 text-center px-6">Seeking to {formatTime(seekTarget)}…</p>
      )}
      {showOverlay && isSyncing && isLongSync && onForceResume && (
        <button
          onClick={onForceResume}
          className="no-gestures pointer-events-auto text-xs lg:text-sm uppercase tracking-[0.12em] border border-paper/40 px-4 py-2 text-paper/80 hover:text-paper hover:border-paper transition-colors"
        >
          Continue without them
        </button>
      )}
    </div>
  );
};
