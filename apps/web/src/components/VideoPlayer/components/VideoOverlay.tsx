import React from 'react';
import { MediaInfo, RoomState } from '@roomies/contracts';

interface VideoOverlayProps {
  mediaInfo: MediaInfo | null;
  roomPlaybackState?: RoomState['playback'];
  isPlaying: boolean;
  isDragging: boolean;
  isAsyncMode: boolean;
}

export const VideoOverlay: React.FC<VideoOverlayProps> = ({
  mediaInfo,
  roomPlaybackState,
  isPlaying,
  isDragging,
  isAsyncMode
}) => {
  let overlayText = '';
  if (!mediaInfo) {
    overlayText = 'THE PARTY WILL START SOON';
  } else if (roomPlaybackState?.state === 'buffering') {
    overlayText = isAsyncMode ? 'BUFFERING' : 'SYNCING';
  } else if (roomPlaybackState?.state === 'paused' || roomPlaybackState?.state === 'waiting' || (!isPlaying && !isDragging)) {
    overlayText = 'PAUSED';
  }

  const showOverlay = Boolean(overlayText) && !isDragging;

  return (
    <div
      className={`absolute inset-0 bg-ink/60 z-20 flex items-center justify-center pointer-events-none transition-opacity duration-300 ${
        showOverlay ? 'opacity-100' : 'opacity-0'
      }`}
    >
      <h2 className={`text-sm lg:text-3xl font-medium tracking-[0.12em] text-paper/80 animate-pulse drop-shadow-lg text-center px-6 ${mediaInfo ? 'uppercase' : ''}`}>
        {overlayText}
      </h2>
    </div>
  );
};
