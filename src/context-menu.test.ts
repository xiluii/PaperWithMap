import { describe, expect, it } from 'vitest';
import { matchesMenuShortcut, menuPosition, nextMenuIndex } from './context-menu';
import type { ContextMenuItem } from './context-menu';

describe('context menu placement and keyboard navigation', () => {
  it('keeps the menu within the viewport at each edge', () => {
    expect(menuPosition({ x: 1279, y: 719 }, { width: 254, height: 500 }, { width: 1280, height: 720 })).toEqual({ left: 1018, top: 212 });
    expect(menuPosition({ x: -10, y: -20 }, { width: 254, height: 500 }, { width: 1280, height: 720 })).toEqual({ left: 8, top: 8 });
    expect(menuPosition({ x: 374, y: 819 }, { width: 254, height: 500 }, { width: 375, height: 820 })).toEqual({ left: 113, top: 312 });
  });
  it('skips separators and disabled actions, wraps both ways and handles a fully disabled menu', () => {
    const items: ContextMenuItem[] = [{ id: 'undo', label: '撤销', disabled: true }, { type: 'separator' }, { id: 'open', label: '打开' }, { id: 'rename', label: '重命名' }];
    expect(nextMenuIndex(items, -1, 1)).toBe(2);
    expect(nextMenuIndex(items, 2, -1)).toBe(3);
    expect(nextMenuIndex(items, 3, 1)).toBe(2);
    expect(nextMenuIndex(items, 0, -1)).toBe(3);
    expect(nextMenuIndex(items.slice(0, 2), -1, 1)).toBe(-1);
    expect(nextMenuIndex([], -1, 1)).toBe(-1);
  });
  it('matches displayed shortcuts without swallowing a different modifier combination', () => {
    const event = { key: 'z', ctrlKey: true, metaKey: false, shiftKey: false, altKey: false };
    expect(matchesMenuShortcut('Ctrl+Z', event)).toBe(true);
    expect(matchesMenuShortcut('Ctrl+Z', { ...event, shiftKey: true })).toBe(false);
    expect(matchesMenuShortcut('Ctrl+Shift+Z', { ...event, shiftKey: true })).toBe(true);
    expect(matchesMenuShortcut('Ctrl+Z', { ...event, ctrlKey: false, metaKey: true })).toBe(true);
    expect(matchesMenuShortcut('N', { ...event, key: 'n' })).toBe(false);
    expect(matchesMenuShortcut('N', { ...event, key: 'n', ctrlKey: false })).toBe(true);
  });
});
