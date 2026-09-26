import { describe, it, expect } from 'vitest';
import { isEditableTarget, resolveHotkey } from '@roomies/web/src/lib/keyboard';

const key = (k: string, extra: Partial<KeyboardEvent> = {}) =>
  ({ key: k, metaKey: false, ctrlKey: false, altKey: false, target: { tagName: 'DIV' }, ...extra }) as unknown as KeyboardEvent;

describe('keyboard', () => {
  it('detects editable targets', () => {
    expect(isEditableTarget({ tagName: 'INPUT' } as unknown as EventTarget)).toBe(true);
    expect(isEditableTarget({ tagName: 'DIV', isContentEditable: true } as unknown as EventTarget)).toBe(true);
    expect(isEditableTarget({ tagName: 'BUTTON' } as unknown as EventTarget)).toBe(false);
    expect(isEditableTarget(null)).toBe(false);
  });

  it('resolves keys case-insensitively and ignores modified or editable events', () => {
    const handler = () => {};
    const map = { t: handler, ArrowRight: handler };
    expect(resolveHotkey(map, key('T'))).toBe(handler);
    expect(resolveHotkey(map, key('ArrowRight'))).toBe(handler);
    expect(resolveHotkey(map, key('ArrowRight', { metaKey: true }))).toBeUndefined();
    expect(resolveHotkey(map, key('t', { ctrlKey: true }))).toBeUndefined();
    expect(resolveHotkey(map, key('t', { target: { tagName: 'TEXTAREA' } as unknown as EventTarget }))).toBeUndefined();
    expect(resolveHotkey(map, key('x'))).toBeUndefined();
  });
});
