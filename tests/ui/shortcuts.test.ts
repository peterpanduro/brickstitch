import { describe, expect, it } from 'vitest';
import { shortcut, shortcutHints, type KeyLike } from '../../src/ui/shortcuts';

const k = (key: string, o: Partial<KeyLike> = {}): KeyLike => ({
  key,
  metaKey: false,
  ctrlKey: false,
  shiftKey: false,
  altKey: false,
  target: null,
  ...o,
});

describe('shortcut', () => {
  it('maps ⌘Z / Ctrl+Z to undo and ⇧⌘Z / Ctrl+Y to redo', () => {
    expect(shortcut(k('z', { metaKey: true }))).toBe('undo');
    expect(shortcut(k('z', { ctrlKey: true }))).toBe('undo');
    expect(shortcut(k('Z', { metaKey: true, shiftKey: true }))).toBe('redo');
    expect(shortcut(k('y', { ctrlKey: true }))).toBe('redo');
  });

  it('maps digits 1–9 to colour indices, not 0 or modified digits', () => {
    expect(shortcut(k('3'))).toBe(3);
    expect(shortcut(k('0'))).toBeNull();
    expect(shortcut(k('3', { metaKey: true }))).toBeNull();
  });

  it('ignores keys typed into form fields', () => {
    expect(shortcut(k('3', { target: { tagName: 'INPUT' } }))).toBeNull();
    expect(shortcut(k('z', { metaKey: true, target: { tagName: 'TEXTAREA' } }))).toBeNull();
    expect(shortcut(k('3', { target: { tagName: 'BUTTON' } }))).toBe(3);
    expect(shortcut(k('3', { target: { tagName: 'DIV', isContentEditable: true } }))).toBeNull();
  });

  it('hints follow the platform', () => {
    expect(shortcutHints(true)).toEqual({ undo: '⌘Z', redo: '⇧⌘Z' });
    expect(shortcutHints(false)).toEqual({ undo: 'Ctrl+Z', redo: 'Ctrl+Y' });
  });
});
