import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { MouseEvent as ReactMouseEvent, ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Check, X } from 'lucide-react';
import { matchesMenuShortcut, menuPosition, nextMenuIndex } from '../context-menu';
import type { ContextMenuItem } from '../context-menu';

type Menu = { title: string; items: ContextMenuItem[]; x: number; y: number; origin: HTMLElement | null; target: Element };
type MenuApi = { open: (event: ReactMouseEvent | MouseEvent, title: string, items: ContextMenuItem[]) => void };
const Context = createContext<MenuApi | null>(null);
export function useContextMenu() {
  const context = useContext(Context);
  if (!context) throw new Error('ContextMenuProvider is required');
  return context;
}

export function ContextMenuProvider({ children }: { children: ReactNode }) {
  const [menu, setMenu] = useState<Menu | null>(null), [error, setError] = useState('');
  const active = useRef(menu); active.current = menu;
  const close = useCallback((restore = true) => {
    const origin = active.current?.origin; active.current = null; setMenu(null);
    if (restore && origin?.isConnected) origin.focus({ preventScroll: true });
  }, []);
  const open = useCallback<MenuApi['open']>((event, title, items) => {
    event.preventDefault(); event.stopPropagation();
    const target = event.target instanceof Element ? event.target : document.body;
    const bounds = target.getBoundingClientRect();
    const next = { title, items, target, x: event.clientX || bounds.left + Math.min(24, bounds.width / 2), y: event.clientY || bounds.top + Math.min(24, bounds.height / 2), origin: document.activeElement instanceof HTMLElement ? document.activeElement : null };
    setError(''); active.current = next; setMenu(next);
  }, []);
  useEffect(() => {
    if (!menu) return;
    const dismiss = () => close(false);
    const scroll = (event: Event) => { if (!(event.target instanceof Element) || !event.target.closest('.app-context-menu')) dismiss(); };
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape' || event.key === 'Tab') { event.preventDefault(); event.stopImmediatePropagation(); close(); }
    };
    window.addEventListener('blur', dismiss); window.addEventListener('resize', dismiss);
    document.addEventListener('scroll', scroll, true); document.addEventListener('keydown', key, true);
    return () => { window.removeEventListener('blur', dismiss); window.removeEventListener('resize', dismiss); document.removeEventListener('scroll', scroll, true); document.removeEventListener('keydown', key, true); };
  }, [menu, close]);
  useEffect(() => { if (!error) return; const timer = setTimeout(() => setError(''), 5000); return () => clearTimeout(timer); }, [error]);
  const perform = (item: ContextMenuItem) => {
    if (item.type === 'separator' || item.disabled) return;
    close();
    try { Promise.resolve(item.onSelect?.()).catch(error => setError((error as Error).message || '操作未完成，请重试')); }
    catch (error) { setError((error as Error).message || '操作未完成，请重试'); }
  };
  return <Context.Provider value={{ open }}>{children}{menu && createPortal(<div className="app-context-layer" onWheel={event => { if (!(event.target as Element).closest('.app-context-menu')) close(false); }} onContextMenu={event => { event.preventDefault(); close(); }} onPointerDown={event => { if (event.target === event.currentTarget) { event.preventDefault(); event.stopPropagation(); close(); } }}>
    <MenuPanel menu={menu} onSelect={perform} />
  </div>, document.body)}{error && createPortal(<div className="context-menu-error" role="alert"><span>{error}</span><button aria-label="关闭操作提示" onClick={() => setError('')}><X size={14} /></button></div>, document.body)}</Context.Provider>;
}

function MenuPanel({ menu, onSelect }: { menu: Menu; onSelect: (item: ContextMenuItem) => void }) {
  const panel = useRef<HTMLDivElement>(null), items = useRef(new Map<number, HTMLElement>());
  const [position, setPosition] = useState({ left: menu.x, top: menu.y });
  useLayoutEffect(() => {
    const rect = panel.current!.getBoundingClientRect();
    setPosition(menuPosition(menu, rect, { width: innerWidth, height: innerHeight }));
    const index = nextMenuIndex(menu.items, -1, 1);
    if (index >= 0) items.current.get(index)?.focus({ preventScroll: true }); else panel.current?.focus({ preventScroll: true });
  }, [menu]);
  return <div ref={panel} role="menu" aria-label={menu.title} tabIndex={-1} className="app-context-menu" style={position} onKeyDown={event => {
    event.stopPropagation();
    const shortcut = menu.items.find(item => item.type !== 'separator' && !item.disabled && matchesMenuShortcut(item.shortcut, event));
    if (shortcut) { event.preventDefault(); onSelect(shortcut); return; }
    const current = [...items.current.entries()].find(([, element]) => element === document.activeElement)?.[0] ?? -1;
    const index = event.key === 'ArrowDown' ? nextMenuIndex(menu.items, current, 1) : event.key === 'ArrowUp' ? nextMenuIndex(menu.items, current < 0 ? 0 : current, -1) : event.key === 'Home' ? nextMenuIndex(menu.items, -1, 1) : event.key === 'End' ? nextMenuIndex(menu.items, 0, -1) : -1;
    if (index >= 0) { event.preventDefault(); items.current.get(index)?.focus(); }
  }}><div className="app-context-caption">{menu.title}</div>{menu.items.map((item, index) => {
    if (item.type === 'separator') return <div key={index} role="separator" className="app-context-separator" />;
    const Icon = item.icon, contents = <><span className="app-context-icon">{Icon && <Icon size={15} />}</span><span className="app-context-label">{item.label}</span>{item.shortcut && <kbd>{item.shortcut}</kbd>}{item.checked && <Check size={14} className="app-context-check" />}</>;
    const properties = { role: item.checked === undefined ? 'menuitem' : 'menuitemcheckbox', 'aria-checked': item.checked, 'aria-disabled': item.disabled || undefined, tabIndex: -1, className: item.danger ? 'is-danger' : undefined, ref: (element: HTMLElement | null) => { if (element) items.current.set(index, element); else items.current.delete(index); }, onClick: () => onSelect(item) };
    return item.href && !item.disabled ? <a key={item.id} {...properties} href={item.href} download={item.download}>{contents}</a> : <button key={item.id} type="button" {...properties} disabled={item.disabled}>{contents}</button>;
  })}<div className="app-context-hint"><span>↑ ↓ 选择</span><span>Esc 关闭</span></div></div>;
}
