import { useCallback, useRef, useState } from 'react';
import { useDismiss } from './useDismiss';

export function useActiveMenu<T = string>() {
  const [activeMenu, setActiveMenu] = useState<T | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  useDismiss([containerRef], () => setActiveMenu(null), activeMenu !== null);
  const toggleMenu = useCallback((menu: T) => setActiveMenu((current) => (current === menu ? null : menu)), []);
  return { activeMenu, toggleMenu, containerRef };
}
