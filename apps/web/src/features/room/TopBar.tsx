import { ChevronLeft, Settings2, Lock, Unlock } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { TopBarRenderProps } from '../player/types';
import { BAR_EDGE_X, ICON_BTN_PADDING, ICON_PRIMARY, ICON_SECONDARY } from '../player/styleTokens';
import { usePresentation } from './PresentationContext';
import { useMediaInfo, useRoomSelector } from './RoomProvider';

interface TopBarProps extends TopBarRenderProps {
  onExit: () => void;
  onManage: () => void;
}

export function TopBar({ isSelfLocked, onToggleSelfLock, isServerLocked, activeLockByAdmin, onExit, onManage }: TopBarProps) {
  const { user } = useAuth();
  const { isFullscreen } = usePresentation();
  const mediaInfo = useMediaInfo();
  const viewersCount = useRoomSelector((s) => s.room?.members.length ?? 0);

  return (
    <div className={`grid grid-cols-[1fr_minmax(0,auto)_1fr] items-center gap-2 ${BAR_EDGE_X} py-2 sm:py-3 lg:py-4 bg-linear-to-b from-ink/80 to-transparent relative`}>
      <div className="flex justify-start">
        {!isFullscreen && (
          <button onClick={onExit} className="flex items-center pointer-coarse:min-h-11 text-12 sm:text-14 lg:text-16 uppercase tracking-[0.08em] hover:text-fog transition-colors whitespace-nowrap">
            <ChevronLeft className="mr-0.5 lg:mr-1 w-3.5 h-3.5 lg:w-4 lg:h-4" /> Exit
          </button>
        )}
      </div>

      <div className="flex justify-center text-12 sm:text-14 lg:text-16 uppercase tracking-[0.08em] items-center gap-1 sm:gap-2 lg:gap-3 drop-shadow-md min-w-0">
        <span className="truncate">{mediaInfo?.title || 'ROOM'}</span>
        <span className="shrink-0">·</span>
        <span className="font-mono text-accent shrink-0">{viewersCount}</span>
        <span className="hidden xs:inline shrink-0">WATCHING</span>
      </div>

      <div className="flex justify-end items-center gap-1.5 sm:gap-3">
        {isServerLocked ? (
          <div
            className={`${ICON_BTN_PADDING} flex items-center justify-center transition-colors ${activeLockByAdmin ? 'text-danger' : 'text-paper/40'}`}
            title={activeLockByAdmin ? 'Controls locked by admin' : 'No media'}
          >
            <Lock className={ICON_PRIMARY} strokeWidth={1.5} />
          </div>
        ) : (
          <button
            onClick={onToggleSelfLock}
            className={`${ICON_BTN_PADDING} flex items-center justify-center transition-colors ${isSelfLocked ? 'text-accent' : 'text-paper/60 hover:text-paper'}`}
            title={isSelfLocked ? 'Unlock controls' : 'Lock controls'}
          >
            {isSelfLocked ? <Lock className={ICON_PRIMARY} strokeWidth={1.5} /> : <Unlock className={ICON_PRIMARY} strokeWidth={1.5} />}
          </button>
        )}
        {user?.role === 'root' && (
          <button onClick={onManage} aria-label="Manage" className={`flex items-center text-12 sm:text-14 lg:text-16 uppercase tracking-[0.08em] hover:text-fog transition-colors ${ICON_BTN_PADDING}`}>
            <span className="hidden sm:inline">Manage</span>
            <Settings2 className={`sm:ml-1 lg:ml-2 ${ICON_SECONDARY}`} />
          </button>
        )}
      </div>
    </div>
  );
}
