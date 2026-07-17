import { useState, useEffect, useRef } from 'react';

export function useActiveMenu<T = string>() {
  const [activeMenu, setActiveMenu] = useState<T | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent | TouchEvent) => {
      if (
        containerRef.current && 
        !containerRef.current.contains(event.target as Node)
      ) {
        setActiveMenu(null);
      }
    };

    if (activeMenu) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('touchstart', handleClickOutside);
    }
    
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, [activeMenu]);

  const toggleMenu = (menuName: T) => {
    setActiveMenu((current) => (current === menuName ? null : menuName));
  };

  return { activeMenu, setActiveMenu, toggleMenu, containerRef };
}
