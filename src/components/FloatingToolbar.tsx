import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { ChevronDown, ChevronUp, GripVertical, MoreHorizontal, RotateCcw } from 'lucide-react';
import { clampFloating } from '../floating-layout';
import type { FloatingPosition } from '../floating-layout';
import { useLayoutPreference } from './PanelControls';

const validPosition = (value: unknown): value is FloatingPosition | null => value === null || !!value && typeof value === 'object' && Number.isFinite((value as FloatingPosition).x) && Number.isFinite((value as FloatingPosition).y);
export default function FloatingToolbar({ label, storageKey, className, children }: { label: string; storageKey: string; className: string; children: ReactNode }) {
  const [position, setPosition] = useLayoutPreference<FloatingPosition | null>(storageKey + '-position', null, validPosition);
  const [collapsed, setCollapsed] = useLayoutPreference(storageKey + '-collapsed', false, (v): v is boolean => typeof v === 'boolean');
  const [menu, setMenu] = useState(false), [moving, setMoving] = useState(false), [bounds, setBounds] = useState({ width: 0, height: 0, areaWidth: 0, areaHeight: 0 });
  const root = useRef<HTMLDivElement>(null), drag = useRef<{ id: number; x: number; y: number; start: FloatingPosition } | null>(null);
  const pending = useRef<FloatingPosition | null>(null), frame = useRef(0);
  useEffect(() => { const node = root.current, area = node?.parentElement; if (!node || !area) return; const measure = () => setBounds({ width: node.offsetWidth, height: node.offsetHeight, areaWidth: area.clientWidth, areaHeight: area.clientHeight }); const observer = new ResizeObserver(measure); observer.observe(node); observer.observe(area); measure(); return () => { observer.disconnect(); cancelAnimationFrame(frame.current); }; }, []);
  const constrain = (value: FloatingPosition) => clampFloating(value, { width: bounds.areaWidth, height: bounds.areaHeight }, bounds);
  const flush = () => { frame.current = 0; if (pending.current) { setPosition(pending.current); pending.current = null; } };
  const actual = position && bounds.areaWidth > 0 ? constrain(position) : null;
  const place = (top: boolean) => { setPosition(constrain({ x: (bounds.areaWidth - bounds.width) / 2, y: top ? 8 : bounds.areaHeight - bounds.height - 16 })); setMenu(false); };
  return <div ref={root} role="toolbar" aria-label={label} className={`floating-toolbar ${className} ${collapsed ? 'is-collapsed' : ''} ${moving ? 'is-moving' : ''}`} style={actual ? { left: actual.x, top: actual.y, bottom: 'auto', transform: 'none' } : undefined}>
    <div className="floating-toolbar-controls"><button className="floating-drag-handle" aria-label={`移动${label}`} title="拖动移动 · 方向键微调 · 双击归位" onDoubleClick={() => setPosition(null)} onKeyDown={event => {
      const delta = { ArrowLeft: [-16, 0], ArrowRight: [16, 0], ArrowUp: [0, -16], ArrowDown: [0, 16] }[event.key]; if (!delta) return; event.preventDefault(); event.stopPropagation(); const node = root.current!, area = node.parentElement!, r = node.getBoundingClientRect(), a = area.getBoundingClientRect(); setPosition(constrain({ x: r.left - a.left + delta[0], y: r.top - a.top + delta[1] }));
    }} onPointerDown={event => { if (event.button !== 0) return; event.preventDefault(); event.stopPropagation(); const node = root.current!, area = node.parentElement!, r = node.getBoundingClientRect(), a = area.getBoundingClientRect(); drag.current = { id: event.pointerId, x: event.clientX, y: event.clientY, start: { x: r.left - a.left, y: r.top - a.top } }; event.currentTarget.setPointerCapture(event.pointerId); setMoving(true); }} onPointerMove={event => { const start = drag.current; if (start?.id !== event.pointerId) return; pending.current = constrain({ x: start.start.x + event.clientX - start.x, y: start.start.y + event.clientY - start.y }); if (!frame.current) frame.current = requestAnimationFrame(flush); }} onPointerUp={event => { if (drag.current?.id !== event.pointerId) return; cancelAnimationFrame(frame.current); flush(); drag.current = null; setMoving(false); if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); }} onPointerCancel={() => { drag.current = null; pending.current = null; setMoving(false); }} onLostPointerCapture={() => { drag.current = null; setMoving(false); }}><GripVertical size={14}/></button>
      <button aria-label={collapsed ? `展开${label}` : `收起${label}`} aria-expanded={!collapsed} title={collapsed ? '展开工具栏' : '收起工具栏'} onClick={() => { setCollapsed(v => !v); setMenu(false); }}>{collapsed ? <ChevronUp size={14}/> : <ChevronDown size={14}/>}</button><button aria-label={`${label}位置选项`} aria-expanded={menu} title="工具栏位置" onClick={() => setMenu(v => !v)}><MoreHorizontal size={14}/></button>
    </div><div className="floating-toolbar-content" hidden={collapsed}>{children}</div>
    {menu && <div className="floating-toolbar-menu"><button onClick={() => place(true)}><ChevronUp size={13}/>移至顶部</button><button onClick={() => place(false)}><ChevronDown size={13}/>移至底部</button><button onClick={() => { setPosition(null); setMenu(false); }}><RotateCcw size={13}/>恢复默认位置</button></div>}
  </div>;
}
