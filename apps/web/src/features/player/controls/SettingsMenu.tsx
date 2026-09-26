import React, { useEffect, useMemo, useState } from 'react';
import { Settings, ChevronRight, ChevronLeft, Minus, Plus } from 'lucide-react';
import type { Level, MediaPlaylist } from 'hls.js';
import type { SubtitleTrack } from '@roomies/contracts';
import { useActiveMenu } from '../../../ui/useActiveMenu';
import { displaySubtitleLabel, languageName, sortSubtitles } from '../../../lib/subtitleLabels';
import { ICON_SECONDARY } from '../styleTokens';
import { ControlButton } from './ControlButton';
import { ControlPopover, PopoverItem, PopoverEmpty, PopoverSection } from './ControlPopover';

export interface SubtitleControls {
  activeSubtitleId: string | null;
  setActiveSubtitleId: (id: string | null) => void;
  subtitleOffsetSec: number;
  setSubtitleOffsetSec: (offset: number) => void;
  subtitleFontScale: number;
  setSubtitleFontScale: (scale: number) => void;
}

interface SettingsMenuProps {
  levels: Level[];
  currentLevel: number;
  onQualityChange: (index: number) => void;
  audioTracks: MediaPlaylist[];
  currentAudioTrack: number;
  onAudioTrackChange: (index: number) => void;
  subtitles: SubtitleTrack[];
  subs: SubtitleControls;
  playbackRate: number;
  onCycleRate?: () => void;
  onOpenChange: (open: boolean) => void;
}

type Panel = 'main' | 'quality' | 'subtitles' | 'subtitle-settings' | 'audio';

const FONT_SCALES = [
  { label: 'S', scale: 0.75 },
  { label: 'M', scale: 1 },
  { label: 'L', scale: 1.5 },
];

const levelLabel = (level?: Level) => level?.name || (level ? `${level.height}p` : '');

const audioTrackLabel = (track: MediaPlaylist, index: number) => track.name || (track.lang ? languageName(track.lang) : '') || `Track ${index + 1}`;

const ROW = 'w-full flex items-center px-3 sm:px-3.5 py-1.5 sm:py-2 pointer-coarse:min-h-8 text-11 sm:text-13 lg:text-14 transition-colors';

const SettingsRow: React.FC<{ label: string; value: string; onClick: () => void; className?: string }> = ({ label, value, onClick, className = '' }) => (
  <button onClick={onClick} className={`${ROW} gap-3 sm:gap-4 text-paper hover:bg-ash/20 ${className}`}>
    <span className="w-16 sm:w-20 text-left shrink-0">{label}</span>
    <span className="flex-1 flex items-center justify-between gap-1 text-paper/50 min-w-0 overflow-hidden">
      <span className="text-11 sm:text-12 lg:text-13 truncate text-left">{value}</span>
      <ChevronRight className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" strokeWidth={2} />
    </span>
  </button>
);

const PanelHeader: React.FC<{ label: string; onBack: () => void }> = ({ label, onBack }) => (
  <button onClick={onBack} className={`${ROW} gap-1.5 text-paper/70 hover:text-paper bg-ink sticky top-0 z-10 -mt-1 sm:-mt-1.5 border-b border-ash/15 min-w-0`}>
    <ChevronLeft className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" strokeWidth={2} />
    <span className="font-medium truncate">{label}</span>
  </button>
);

const StepButton: React.FC<{ onClick: () => void; title: string; children: React.ReactNode }> = ({ onClick, title, children }) => (
  <button
    onClick={onClick}
    title={title}
    aria-label={title}
    className="flex items-center justify-center w-7 h-7 pointer-coarse:w-9 pointer-coarse:h-9 text-paper/80 hover:text-paper hover:bg-ash/20 transition-colors shrink-0"
  >
    {children}
  </button>
);

export const SettingsMenu: React.FC<SettingsMenuProps> = ({
  levels,
  currentLevel,
  onQualityChange,
  audioTracks,
  currentAudioTrack,
  onAudioTrackChange,
  subtitles,
  subs,
  playbackRate,
  onCycleRate,
  onOpenChange,
}) => {
  const { activeMenu, toggleMenu, containerRef } = useActiveMenu<'settings'>();
  const [panel, setPanel] = useState<Panel>('main');
  const isOpen = activeMenu === 'settings';

  useEffect(() => {
    onOpenChange(isOpen);
    if (!isOpen) setPanel('main');
  }, [isOpen, onOpenChange]);

  const sortedSubtitles = useMemo(() => sortSubtitles(subtitles), [subtitles]);
  const { activeSubtitleId, setActiveSubtitleId, subtitleOffsetSec, setSubtitleOffsetSec, subtitleFontScale, setSubtitleFontScale } = subs;
  const audioIndex = currentAudioTrack >= 0 && currentAudioTrack < audioTracks.length ? currentAudioTrack : 0;
  const subtitleLabel = activeSubtitleId === null ? 'Off' : displaySubtitleLabel(subtitles.find((s) => s.id === activeSubtitleId)?.language ?? null);
  const shiftSubtitles = (delta: number) => setSubtitleOffsetSec(Math.round((subtitleOffsetSec + delta) * 10) / 10);

  return (
    <div className="relative" ref={containerRef}>
      <ControlButton onClick={() => toggleMenu('settings')} active={isOpen} title="Settings">
        <Settings className={ICON_SECONDARY} strokeWidth={1.5} />
      </ControlButton>

      {isOpen && (
        <ControlPopover className="bottom-full right-0 mb-3">
          {panel === 'main' && (
            <div className="py-1">
              {levels.length > 0 && <SettingsRow label="Quality" value={currentLevel === -1 ? 'Auto' : levelLabel(levels[currentLevel])} onClick={() => setPanel('quality')} />}
              <SettingsRow label="Subtitles" value={subtitleLabel} onClick={() => setPanel('subtitles')} />
              {audioTracks.length > 1 && <SettingsRow label="Audio" value={audioTrackLabel(audioTracks[audioIndex], audioIndex)} onClick={() => setPanel('audio')} />}
              {onCycleRate && <SettingsRow label="Speed" value={`${playbackRate}x`} onClick={onCycleRate} className="@min-[30rem]/player:hidden" />}
            </div>
          )}

          {panel === 'quality' && (
            <>
              <PanelHeader label="Quality" onBack={() => setPanel('main')} />
              <PopoverItem active={currentLevel === -1} onClick={() => onQualityChange(-1)}>
                Auto
              </PopoverItem>
              {levels
                .map((level, index) => ({ level, index }))
                .reverse()
                .map(({ level, index }) => (
                  <PopoverItem key={index} active={currentLevel === index} onClick={() => onQualityChange(index)}>
                    {levelLabel(level)}
                  </PopoverItem>
                ))}
            </>
          )}

          {panel === 'subtitles' && (
            <>
              <PanelHeader label="Subtitles" onBack={() => setPanel('main')} />
              {subtitles.length === 0 ? (
                <PopoverEmpty>No subtitles available</PopoverEmpty>
              ) : (
                <>
                  <PopoverItem active={activeSubtitleId === null} onClick={() => setActiveSubtitleId(null)}>
                    Off
                  </PopoverItem>
                  {sortedSubtitles.map((sub) => (
                    <PopoverItem key={sub.id} active={activeSubtitleId === sub.id} onClick={() => setActiveSubtitleId(sub.id)}>
                      {displaySubtitleLabel(sub.language)}
                    </PopoverItem>
                  ))}
                  {activeSubtitleId !== null && (
                    <div className="sticky bottom-0 -mb-1 sm:-mb-1.5 bg-ink border-t border-ash/15 mt-1">
                      <button onClick={() => setPanel('subtitle-settings')} className={`${ROW} justify-between gap-2 text-paper/60 hover:text-paper hover:bg-ash/20`}>
                        Settings
                        <ChevronRight className="w-3.5 h-3.5 sm:w-4 sm:h-4 opacity-50" strokeWidth={2} />
                      </button>
                    </div>
                  )}
                </>
              )}
            </>
          )}

          {panel === 'audio' && (
            <>
              <PanelHeader label="Audio" onBack={() => setPanel('main')} />
              {audioTracks.map((track, index) => (
                <PopoverItem key={index} active={audioIndex === index} onClick={() => onAudioTrackChange(index)}>
                  {audioTrackLabel(track, index)}
                </PopoverItem>
              ))}
            </>
          )}

          {panel === 'subtitle-settings' && (
            <>
              <PanelHeader label="Settings" onBack={() => setPanel('subtitles')} />
              <PopoverSection label="Timing">
                <div className="flex items-center justify-center gap-1.5 sm:gap-3 px-3 sm:px-3.5 py-0.5 sm:py-1">
                  <StepButton onClick={() => shiftSubtitles(-0.5)} title="Shift earlier">
                    <Minus className="w-3.5 h-3.5" strokeWidth={2} />
                  </StepButton>
                  <span className="text-13 lg:text-14 text-paper tabular-nums w-14 text-center">
                    {subtitleOffsetSec > 0 ? '+' : ''}
                    {subtitleOffsetSec.toFixed(1)}s
                  </span>
                  <StepButton onClick={() => shiftSubtitles(0.5)} title="Shift later">
                    <Plus className="w-3.5 h-3.5" strokeWidth={2} />
                  </StepButton>
                </div>
                {subtitleOffsetSec !== 0 && (
                  <button onClick={() => setSubtitleOffsetSec(0)} className="w-full text-center py-1 pointer-coarse:min-h-8 text-12 text-paper/50 hover:text-paper transition-colors">
                    Reset
                  </button>
                )}
              </PopoverSection>
              <PopoverSection label="Size">
                <div className="flex items-center mx-3 sm:mx-3.5 my-0.5 sm:my-1 border border-ash/20">
                  {FONT_SCALES.map(({ label, scale }, i) => (
                    <button
                      key={label}
                      onClick={() => setSubtitleFontScale(scale)}
                      className={`flex-1 py-1 pointer-coarse:min-h-8 text-12 lg:text-14 transition-colors ${i > 0 ? 'border-l border-ash/20' : ''} ${
                        Math.abs(subtitleFontScale - scale) < 0.01 ? 'bg-accent/10 text-accent font-medium' : 'text-paper hover:bg-ash/20'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </PopoverSection>
            </>
          )}
        </ControlPopover>
      )}
    </div>
  );
};
