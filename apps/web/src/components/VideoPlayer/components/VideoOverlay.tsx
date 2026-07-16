import React, { useRef, useEffect } from 'react';
import { MediaInfo, RoomState } from '../../../hooks/useRoomSync';

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
  const overlayTextRef = useRef(!mediaInfo ? 'THE PARTY WILL START SOON' : 'PAUSED');

  useEffect(() => {
    if (!mediaInfo) {
      overlayTextRef.current = 'THE PARTY WILL START SOON';
    } else if (roomPlaybackState?.state === 'buffering') {
      overlayTextRef.current = isAsyncMode ? 'BUFFERING' : 'SYNCING';
    } else if (roomPlaybackState?.state === 'paused' || roomPlaybackState?.state === 'waiting') {
      overlayTextRef.current = 'PAUSED';
    }
  }, [mediaInfo, roomPlaybackState?.state, isAsyncMode]);

  const showOverlay = roomPlaybackState !== undefined && (roomPlaybackState.state === 'buffering' || (!isPlaying && !isDragging));

  return (
    <div
      className={`absolute inset-0 bg-ink/60 z-20 flex items-center justify-center pointer-events-none transition-opacity duration-300 ${
        showOverlay ? 'opacity-100' : 'opacity-0'
      }`}
    >
      <h2 className={`text-sm lg:text-3xl font-medium tracking-[0.12em] text-paper/80 animate-pulse drop-shadow-lg text-center px-6 ${mediaInfo ? 'uppercase' : ''}`}>
        {overlayTextRef.current}
      </h2>
    </div>
  );
};
