import { createContext, useCallback, useContext, useMemo, useRef, useState, ReactNode } from 'react';
import { isPhoneScreen, useLayout } from '../../lib/breakpoints';
import { usePresentation } from './PresentationContext';

export type SidebarTab = 'chat' | 'party' | 'settings';

export interface FocusableInput {
  focus: () => void;
}

interface SidebarState {
  isOpen: boolean;
  available: boolean;
  setOpen: (open: boolean) => void;
  tab: SidebarTab;
  setTab: (tab: SidebarTab) => void;
  docked: boolean;
  chatVisible: boolean;
  openChat: () => void;
  registerChatInput: (input: FocusableInput | null) => void;
}

const SidebarContext = createContext<SidebarState | null>(null);

export function SidebarProvider({ children }: { children: ReactNode }) {
  const [wantsOpen, setOpen] = useState(false);
  const [tab, setTab] = useState<SidebarTab>('chat');
  const chatInputRef = useRef<FocusableInput | null>(null);
  const layout = useLayout();
  const { isFullscreen } = usePresentation();

  const available = layout !== 'short' && !(isFullscreen && isPhoneScreen());
  const isOpen = wantsOpen && available;
  const docked = layout === 'column' && !isFullscreen;
  const chatVisible = tab === 'chat' && (docked || isOpen);

  const openChat = useCallback(() => {
    setOpen(true);
    setTab('chat');
    requestAnimationFrame(() => chatInputRef.current?.focus());
  }, []);

  const registerChatInput = useCallback((input: FocusableInput | null) => {
    chatInputRef.current = input;
  }, []);

  const value = useMemo(
    () => ({ isOpen, available, setOpen, tab, setTab, docked, chatVisible, openChat, registerChatInput }),
    [isOpen, available, tab, docked, chatVisible, openChat, registerChatInput],
  );

  return <SidebarContext.Provider value={value}>{children}</SidebarContext.Provider>;
}

export function useSidebar() {
  const value = useContext(SidebarContext);
  if (!value) throw new Error('useSidebar must be used within a SidebarProvider');
  return value;
}
