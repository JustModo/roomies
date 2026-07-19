import React, { useEffect, useRef, useState } from 'react';
import { MicOff, VideoOff, Mic, Video, Loader2, Settings, X, ChevronDown } from 'lucide-react';
import { useVoice } from '../../contexts/VoiceContext';
import { useActiveMenu } from '../../hooks/useActiveMenu';

interface PartyControlsProps {
  isJoined: boolean;
  isMicMuted: boolean;
  isVideoMuted: boolean;
  updatePartyState: (updates: { isJoined?: boolean; micMuted?: boolean; videoMuted?: boolean }) => void;
  onJoin: () => Promise<void>;
}

interface DeviceOption {
  deviceId: string;
  label: string;
}

interface DeviceSelectProps {
  label: string;
  disabledHint?: string;
  disabled?: boolean;
  value: string | undefined;
  options: DeviceOption[];
  onChange: (deviceId: string | undefined) => void;
}

/**
 * Custom dropdown for picking an input/output device.
 *
 * Deliberately NOT a native <select> — native option lists are OS-level
 * overlays that paint over whatever sits above them on the page (so opening
 * the speaker list would visually erase the microphone section right above
 * it), and truncate long device names unpredictably. This renders entirely
 * within our own panel instead.
 */
const DeviceSelect: React.FC<DeviceSelectProps> = ({ label, disabledHint, disabled, value, options, onChange }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleOutside = (e: MouseEvent | TouchEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handleOutside);
    document.addEventListener('touchstart', handleOutside);
    return () => {
      document.removeEventListener('mousedown', handleOutside);
      document.removeEventListener('touchstart', handleOutside);
    };
  }, [open]);

  const currentLabel = value ? options.find((o) => o.deviceId === value)?.label ?? 'Unknown device' : 'System Default';

  return (
    <div ref={ref} className="relative flex flex-col gap-1">
      <label className="text-11 uppercase tracking-widest text-paper/50 font-semibold">
        {label}
        {disabledHint && <span className="normal-case font-normal text-paper/30"> ({disabledHint})</span>}
      </label>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        title={currentLabel}
        className="w-full flex items-center justify-between gap-2 bg-ash/5 border border-ash/10 rounded px-2 py-1.5 text-13 text-paper text-left outline-none disabled:opacity-40 disabled:cursor-not-allowed"
      >
        <span className="truncate">{currentLabel}</span>
        <ChevronDown size={14} className="shrink-0 text-paper/40" />
      </button>

      {open && !disabled && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-ink border border-ash/10 rounded shadow-lg max-h-40 overflow-y-auto z-20">
          <button
            type="button"
            onClick={() => { onChange(undefined); setOpen(false); }}
            className={`w-full text-left px-2 py-1.5 text-13 truncate hover:bg-ash/10 ${!value ? 'text-paper bg-ash/10' : 'text-paper/70'}`}
          >
            System Default
          </button>
          {options.map((o) => (
            <button
              key={o.deviceId}
              type="button"
              onClick={() => { onChange(o.deviceId); setOpen(false); }}
              title={o.label}
              className={`w-full text-left px-2 py-1.5 text-13 truncate hover:bg-ash/10 ${value === o.deviceId ? 'text-paper bg-ash/10' : 'text-paper/70'}`}
            >
              {o.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export const PartyControls: React.FC<PartyControlsProps> = ({
  isJoined,
  isMicMuted,
  isVideoMuted,
  updatePartyState,
  onJoin,
}) => {
  const [isJoining, setIsJoining] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);
  const {
    inputDevices,
    outputDevices,
    selectedInputId,
    selectedOutputId,
    setInputDevice,
    setOutputDevice,
    outputSelectionSupported,
    notice,
    dismissNotice,
  } = useVoice();
  const { activeMenu, toggleMenu, containerRef } = useActiveMenu<'devices'>();

  const handleJoin = async () => {
    setIsJoining(true);
    setJoinError(null);
    try {
      await onJoin();
      updatePartyState({ isJoined: true, micMuted: true, videoMuted: true });
    } catch (err) {
      setJoinError(err instanceof Error ? err.message : 'Failed to access microphone.');
    } finally {
      setIsJoining(false);
    }
  };

  const banner = joinError ?? notice;
  const dismissBanner = () => {
    setJoinError(null);
    dismissNotice();
  };

  return (
    <div ref={containerRef} className="shrink-0 border-t border-ash/10 bg-ink p-2 sm:p-3 relative">
      {banner && (
        <div className="mb-2 flex items-start gap-2 bg-red-500/10 border border-red-400/20 rounded px-2 py-1.5 text-11 text-red-300/90">
          <span className="flex-1 leading-snug">{banner}</span>
          <button onClick={dismissBanner} className="shrink-0 text-red-300/60 hover:text-red-300">
            <X size={12} />
          </button>
        </div>
      )}

      {activeMenu === 'devices' && (
        <div className="absolute bottom-full left-2 right-2 sm:left-3 sm:right-3 mb-2 bg-ink border border-ash/10 rounded p-3 flex flex-col gap-3 shadow-lg z-10">
          <DeviceSelect
            label="Microphone"
            value={selectedInputId}
            options={inputDevices}
            onChange={setInputDevice}
          />
          <DeviceSelect
            label="Speaker"
            value={selectedOutputId}
            options={outputDevices}
            onChange={setOutputDevice}
            disabled={!outputSelectionSupported}
            disabledHint={!outputSelectionSupported ? 'not supported in this browser' : undefined}
          />
        </div>
      )}

      {!isJoined ? (
        <button
          onClick={handleJoin}
          disabled={isJoining}
          className="w-full py-2 bg-ash/5 hover:bg-ash/10 disabled:opacity-50 disabled:cursor-not-allowed border border-ash/10 text-paper text-12 font-semibold uppercase tracking-widest transition-all flex items-center justify-center gap-2"
        >
          {isJoining ? (
            <>
              <Loader2 size={14} className="animate-spin" />
              Connecting…
            </>
          ) : (
            'Join Party Channel'
          )}
        </button>
      ) : (
        <div className="flex items-center gap-1 sm:gap-2">
          <button
            onClick={() => updatePartyState({ micMuted: !isMicMuted })}
            className={`w-8 h-8 flex items-center justify-center transition-colors hover:bg-ash/10 ${
              isMicMuted ? 'text-red-400/80 hover:text-red-400' : 'text-paper/60 hover:text-paper'
            }`}
            title={isMicMuted ? 'Unmute microphone' : 'Mute microphone'}
          >
            {isMicMuted ? <MicOff size={16} strokeWidth={1.5} /> : <Mic size={16} strokeWidth={1.5} />}
          </button>
          <button
            onClick={() => updatePartyState({ videoMuted: !isVideoMuted })}
            className={`w-8 h-8 flex items-center justify-center transition-colors hover:bg-ash/10 ${
              isVideoMuted ? 'text-red-400/80 hover:text-red-400' : 'text-paper/60 hover:text-paper'
            }`}
            title={isVideoMuted ? 'Enable video' : 'Disable video'}
          >
            {isVideoMuted ? <VideoOff size={16} strokeWidth={1.5} /> : <Video size={16} strokeWidth={1.5} />}
          </button>
          <button
            onClick={() => toggleMenu('devices')}
            className={`w-8 h-8 flex items-center justify-center transition-colors hover:bg-ash/10 ${
              activeMenu === 'devices' ? 'text-paper' : 'text-paper/60 hover:text-paper'
            }`}
            title="Audio device settings"
          >
            <Settings size={16} strokeWidth={1.5} />
          </button>
          <button
            onClick={() => updatePartyState({ isJoined: false })}
            className="px-3 py-1.5 text-12 font-semibold uppercase tracking-widest text-red-400/70 hover:text-red-400 hover:bg-red-400/5 transition-colors ml-auto"
          >
            Leave
          </button>
        </div>
      )}
    </div>
  );
};
