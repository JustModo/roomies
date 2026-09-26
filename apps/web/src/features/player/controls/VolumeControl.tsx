import React from 'react';
import { Volume2, VolumeX } from 'lucide-react';
import { useServices } from '../../../app/ServicesProvider';
import { ICON_SECONDARY } from '../styleTokens';
import { ControlButton } from './ControlButton';

interface VolumeControlProps {
  volume: number;
  setVolume: (volume: number) => void;
}

export const VolumeControl: React.FC<VolumeControlProps> = ({ volume, setVolume }) => {
  const { media } = useServices();
  const muted = volume === 0;

  return (
    <div className="group relative flex items-center justify-center">
      <ControlButton onClick={() => setVolume(muted ? 1 : 0)} title={muted ? 'Unmute' : 'Mute'}>
        {muted ? <VolumeX className={ICON_SECONDARY} strokeWidth={1.5} /> : <Volume2 className={ICON_SECONDARY} strokeWidth={1.5} />}
      </ControlButton>

      {media.canSetVolume && (
        <div className="absolute bottom-full mb-1 left-1/2 -translate-x-1/2 opacity-0 invisible group-hover:opacity-100 group-hover:visible group-focus-within:opacity-100 group-focus-within:visible pointer-coarse:hidden transition-all duration-200 z-50 pb-2">
          <div className="bg-ink/95 backdrop-blur-md border border-ash/20 py-3 flex flex-col items-center justify-center w-10 h-30">
            <div className="text-11 text-paper/70 font-mono font-bold mb-3">{Math.round(volume * 100)}</div>
            <div className="relative w-1.5 h-16 bg-ash/30 flex justify-center">
              <div className="absolute bottom-0 w-full bg-accent pointer-events-none transition-all duration-75" style={{ height: `${volume * 100}%` }} />
              <input
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={volume}
                aria-label="Volume"
                onChange={(e) => setVolume(parseFloat(e.target.value))}
                className="absolute top-1/2 left-1/2 w-16 h-6 opacity-0 cursor-pointer"
                style={{ transform: 'translate(-50%, -50%) rotate(-90deg)' }}
              />
              <div
                className="absolute w-2.5 h-2.5 bg-paper pointer-events-none transition-all duration-75 left-1/2 -translate-x-1/2"
                style={{ bottom: `calc(${volume * 100}% - 5px)` }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
