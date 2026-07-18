import { useEffect, useRef } from 'react';

interface UseKeyboardShortcutOptions {
  /** When true, the shortcut is not registered (e.g. sidebar already open). */
  disabled?: boolean;
}

/**
 * Attaches a global keydown listener for a single key, ignoring events
 * that originate inside inputs, textareas, or contentEditable elements.
 */
export function useKeyboardShortcut(
  key: string,
  handler: () => void,
  options: UseKeyboardShortcutOptions = {},
) {
  // Keep the handler stable so we don't recreate the listener on every render.
  const handlerRef = useRef(handler);
  useEffect(() => {
    handlerRef.current = handler;
  }, [handler]);

  const { disabled } = options;

  useEffect(() => {
    if (disabled) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore events from editable elements.
      const tag = (document.activeElement as HTMLElement)?.tagName;
      if (
        tag === 'INPUT' ||
        tag === 'TEXTAREA' ||
        (document.activeElement as HTMLElement)?.isContentEditable
      ) {
        return;
      }

      if (e.key.toLowerCase() === key.toLowerCase()) {
        e.preventDefault();
        handlerRef.current();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [key, disabled]);
}
