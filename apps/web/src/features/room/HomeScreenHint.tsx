import { useState } from 'react';
import { X } from 'lucide-react';
import { useServices } from '../../app/ServicesProvider';
import { KEYS } from '../../services/storage';
import { usePresentation } from './PresentationContext';

export function HomeScreenHint() {
  const { media, storage } = useServices();
  const { isPseudoFullscreen } = usePresentation();
  const [dismissed, setDismissed] = useState(() => storage.get(KEYS.homeScreenHint) !== null);

  if (!isPseudoFullscreen || media.standalone || dismissed) return null;

  const dismiss = () => {
    storage.set(KEYS.homeScreenHint, 'dismissed');
    setDismissed(true);
  };

  return (
    <div className="absolute top-14 left-1/2 -translate-x-1/2 z-60 max-w-[90%] flex items-center gap-2 bg-ink/90 border border-ash/30 pl-3 text-12 text-paper/80">
      <span>Add to Home Screen for full-screen playback</span>
      <button onClick={dismiss} aria-label="Dismiss" className="p-2 pointer-coarse:min-w-11 pointer-coarse:min-h-11 flex items-center justify-center text-fog hover:text-paper">
        <X size={14} />
      </button>
    </div>
  );
}
