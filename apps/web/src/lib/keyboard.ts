import { useEffect, useRef } from 'react';
import type React from 'react';

interface ModifierState {
  metaKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
}

const EDITABLE_TAGS = new Set(['INPUT', 'TEXTAREA', 'SELECT']);

export function isEditableTarget(target: EventTarget | null): boolean {
  const el = target as { tagName?: string; isContentEditable?: boolean } | null;
  return !!el && (el.isContentEditable === true || EDITABLE_TAGS.has(el.tagName ?? ''));
}

export const hasModifier = (e: ModifierState) => e.metaKey || e.ctrlKey || e.altKey;

export type HotkeyMap = Partial<Record<string, (e: KeyboardEvent) => void>>;

export function resolveHotkey(map: HotkeyMap, e: KeyboardEvent): ((e: KeyboardEvent) => void) | undefined {
  if (hasModifier(e) || isEditableTarget(e.target)) return undefined;
  return map[e.key] ?? map[e.key.toLowerCase()];
}

export function useHotkeys(map: HotkeyMap, enabled = true) {
  const mapRef = useRef(map);
  useEffect(() => {
    mapRef.current = map;
  });

  useEffect(() => {
    if (!enabled) return;
    const onKeyDown = (e: KeyboardEvent) => {
      const handler = resolveHotkey(mapRef.current, e);
      if (!handler) return;
      e.preventDefault();
      handler(e);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [enabled]);
}

export const onActivateKey = (activate: () => void) => (e: React.KeyboardEvent) => {
  if (e.target !== e.currentTarget || (e.key !== 'Enter' && e.key !== ' ')) return;
  e.preventDefault();
  activate();
};
