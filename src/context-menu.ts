import type { LucideIcon } from 'lucide-react';

export type ContextMenuItem = { type: 'separator' } | {
  type?: 'item'; id: string; label: string; icon?: LucideIcon; shortcut?: string;
  disabled?: boolean; checked?: boolean; danger?: boolean;
  onSelect?: () => void | Promise<void>; href?: string; download?: string;
};
export const menuSeparator: ContextMenuItem = { type: 'separator' };

export function menuPosition(point: { x: number; y: number }, size: { width: number; height: number }, viewport: { width: number; height: number }) {
  const margin = 8;
  return {
    left: Math.max(margin, Math.min(point.x, viewport.width - size.width - margin)),
    top: Math.max(margin, Math.min(point.y, viewport.height - size.height - margin)),
  };
}

export function nextMenuIndex(items: ContextMenuItem[], current: number, direction: 1 | -1) {
  for (let step = 1; step <= items.length; step++) {
    const index = ((current + direction * step) % items.length + items.length) % items.length;
    const item = items[index];
    if (item.type !== 'separator' && !item.disabled) return index;
  }
  return -1;
}

export function nativeContextTarget(target: Element) {
  return !!target.closest('input,textarea,select,[contenteditable]:not([contenteditable="false"]),[data-native-context-menu],a[href],video,audio');
}

export function matchesMenuShortcut(shortcut: string | undefined, event: { key: string; ctrlKey: boolean; metaKey: boolean; shiftKey: boolean; altKey: boolean }) {
  if (!shortcut || event.altKey) return false;
  const keys = shortcut.toLowerCase().split('+'), key = keys[keys.length - 1];
  return event.key.toLowerCase() === key && keys.includes('ctrl') === (event.ctrlKey || event.metaKey) && keys.includes('shift') === event.shiftKey;
}
