import { useEffect, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { GripVertical, GripHorizontal } from 'lucide-react';
import { clampPanelSize } from '../panel-layout';
import type { DockSide } from '../panel-layout';

export function useLayoutPreference<T>(key: string, initial: T, valid: (value: unknown) => value is T) {
  const storageKey = `paperly:layout:${key}`;
  const [value, setValue] = useState<T>(() => { try { const saved: unknown = JSON.parse(localStorage.getItem(storageKey) || 'null'); return valid(saved) ? saved : initial; } catch { return initial; } });
  const latest = useRef(value); latest.current = value;
  useEffect(() => {
    const save = () => { try { localStorage.setItem(storageKey, JSON.stringify(latest.current)); } catch { /* The layout works without storage. */ } };
    const timer = setTimeout(save, 180); window.addEventListener('pagehide', save);
    return () => { clearTimeout(timer); window.removeEventListener('pagehide', save); save(); };
  }, [storageKey, value]);
  return [value, setValue] as const;
}
const isSide = (value: unknown): value is DockSide => value === 'left' || value === 'right';
export function useDockSide(key: string, initial: DockSide) { return useLayoutPreference(key + '-side', initial, isSide); }
export function usePanelWidth(key: string, initial: number) {
  return useLayoutPreference(key + '-width', initial, (value): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 64 && value <= 1000);
}

export function PanelResizeHandle({ label, value, min, max, onChange, direction = 1, reset = value, className = '', axis = 'x' }: {
  label: string; value: number; min: number; max: number; onChange: (value: number) => void; direction?: number; reset?: number; className?: string; axis?: 'x' | 'y';
}) {
  const drag = useRef<{ id: number; x: number; value: number } | null>(null), frame = useRef(0), pending = useRef<number | null>(null);
  const change = useRef(onChange); change.current = onChange;
  const [resizing, setResizing] = useState(false);
  const clamp = (number: number) => clampPanelSize(number, min, max);
  const flush = () => { cancelAnimationFrame(frame.current); frame.current = 0; if (pending.current !== null) { change.current(pending.current); pending.current = null; } };
  const finish = (event: ReactPointerEvent<HTMLElement>) => {
    if (drag.current?.id !== event.pointerId) return;
    flush(); drag.current = null; setResizing(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };
  useEffect(() => () => cancelAnimationFrame(frame.current), []);
  return <div className={`panel-resize-handle ${axis === 'y' ? 'panel-resize-horizontal' : ''} ${resizing ? 'is-resizing' : ''} ${className}`} role="separator" tabIndex={0}
    aria-label={label} aria-orientation={axis === 'x' ? 'vertical' : 'horizontal'} aria-valuemin={Math.round(min)} aria-valuemax={Math.round(Math.max(min, max))} aria-valuenow={Math.round(clamp(value))}
    title="拖动调整大小 · 方向键微调 · 双击还原" onDoubleClick={() => onChange(clamp(reset))}
    onKeyDown={event => {
      const next = event.key === (axis === 'x' ? 'ArrowLeft' : 'ArrowUp') ? value - 16 * direction : event.key === (axis === 'x' ? 'ArrowRight' : 'ArrowDown') ? value + 16 * direction : event.key === 'Home' ? min : event.key === 'End' ? max : event.key === 'Enter' ? reset : null;
      if (next === null) return; event.preventDefault(); event.stopPropagation(); onChange(clamp(next));
    }} onPointerDown={event => {
      if (event.button !== 0) return; event.preventDefault(); event.stopPropagation(); event.currentTarget.focus({ preventScroll: true }); event.currentTarget.setPointerCapture(event.pointerId);
      drag.current = { id: event.pointerId, x: axis === 'x' ? event.clientX : event.clientY, value }; setResizing(true);
    }} onPointerMove={event => {
      const start = drag.current; if (start?.id !== event.pointerId) return;
      pending.current = clamp(start.value + ((axis === 'x' ? event.clientX : event.clientY) - start.x) * direction);
      if (!frame.current) frame.current = requestAnimationFrame(flush);
    }} onPointerUp={finish} onPointerCancel={finish} onLostPointerCapture={finish}><span><GripVertical size={14}/></span></div>;
}

export function PanelPositionHandle({ label, onDrop, onStep }: { label: string; onDrop: (x: number, y: number) => void; onStep: (direction: DockSide) => void }) {
  const drag = useRef<{ id: number; x: number; y: number } | null>(null), [moving, setMoving] = useState(false);
  const finish = (event: ReactPointerEvent<HTMLButtonElement>, cancelled = false) => {
    const start = drag.current; if (start?.id !== event.pointerId) return;
    drag.current = null; setMoving(false);
    if (!cancelled && (Math.abs(event.clientX - start.x) > 24 || Math.abs(event.clientY - start.y) > 24)) onDrop(event.clientX, event.clientY);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };
  return <button type="button" className={`panel-position-handle ${moving ? 'is-moving' : ''}`} aria-label={label}
    title="拖动移动面板 · 左右方向键调整位置" onKeyDown={event => { if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return; event.preventDefault(); event.stopPropagation(); onStep(event.key === 'ArrowLeft' ? 'left' : 'right'); }}
    onPointerDown={event => { if (event.button !== 0) return; event.preventDefault(); event.stopPropagation(); event.currentTarget.setPointerCapture(event.pointerId); drag.current = { id: event.pointerId, x: event.clientX, y: event.clientY }; setMoving(true); }}
    onPointerUp={event => finish(event)} onPointerCancel={event => finish(event, true)} onLostPointerCapture={event => finish(event, true)}><GripHorizontal size={15}/></button>;
}

export function SidebarControls({ label, side, onSide, width, onWidth, min = 240, max = 560, reset = 320 }: {
  label: string; side: DockSide; onSide: (side: DockSide) => void; width: number; onWidth: (width: number) => void; min?: number; max?: number; reset?: number;
}) {
  const mount = useRef<HTMLDivElement>(null), [available, setAvailable] = useState(1200);
  useEffect(() => {
    const root = mount.current?.parentElement?.parentElement; if (!root) return;
    const observer = new ResizeObserver(() => setAvailable(root.clientWidth)); observer.observe(root); setAvailable(root.clientWidth); return () => observer.disconnect();
  }, []);
  return <div className={`sidebar-controls edge-${side === 'left' ? 'right' : 'left'}`} ref={mount}>
    <PanelPositionHandle label={`移动${label}位置`} onStep={onSide} onDrop={x => {
      const bounds = mount.current?.parentElement?.parentElement?.getBoundingClientRect(); if (bounds) onSide(x < bounds.left + bounds.width / 2 ? 'left' : 'right');
    }}/>
    <PanelResizeHandle label={`调整${label}宽度`} value={clampPanelSize(width,min,Math.min(max,Math.max(min,available-300)))} min={min} max={Math.min(max, Math.max(min, available - 300))} reset={reset} direction={side === 'left' ? 1 : -1} onChange={onWidth}/>
  </div>;
}
