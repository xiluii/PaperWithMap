import { useEffect, useRef, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { BookOpen, Columns3, MessageSquare, PanelTop, PenLine, X } from 'lucide-react';
import { allocatePanes, defaultReadingWeights, movePane, readingMinimums, readingPaneIds, validPaneOrder } from '../panel-layout';
import type { ReadingPaneId } from '../panel-layout';
import { PanelPositionHandle, PanelResizeHandle, useLayoutPreference } from './PanelControls';

const names = { document: '论文', notes: '手写笔记', ai: 'AI 对话' }, icons = { document: BookOpen, notes: PenLine, ai: MessageSquare };
const isOrder = (value: unknown): value is ReadingPaneId[] => JSON.stringify(validPaneOrder(value)) === JSON.stringify(value);
const isWeights = (value: unknown): value is typeof defaultReadingWeights => !!value && typeof value === 'object' && readingPaneIds.every(id => typeof (value as Record<string, unknown>)[id] === 'number' && Number.isFinite((value as Record<string, number>)[id]) && (value as Record<string, number>)[id] > 0 && (value as Record<string, number>)[id] <= 1);

export function useReadingWorkspace() {
  const [active, setActive] = useState<ReadingPaneId>('document'), [hidden, setHidden] = useState<ReadingPaneId[]>([]);
  const [mode, setMode] = useLayoutPreference<'split' | 'tabs'>('reader-mode', 'tabs', (value): value is 'split' | 'tabs' => value === 'split' || value === 'tabs');
  const open = (pane: ReadingPaneId) => { setHidden(previous => previous.filter(id => id !== pane)); setActive(pane); };
  return { active, setActive, hidden, setHidden, mode, setMode, open };
}
export type ReadingLayout = ReturnType<typeof useReadingWorkspace>;
export default function ReadingWorkspace({ layout, document, notes, ai, expanded = false, documentLabel = '论文', onRestore }: { layout: ReadingLayout; document: ReactNode; notes: ReactNode; ai: (visible: boolean) => ReactNode; expanded?: boolean; documentLabel?: string; onRestore?: () => void }) {
  const labels = {...names, document: documentLabel};
  const root = useRef<HTMLDivElement>(null), [width, setWidth] = useState(1200);
  const [order, setOrder] = useLayoutPreference('reader-order', [...readingPaneIds], isOrder);
  const [weights, setWeights] = useLayoutPreference('reader-weights', defaultReadingWeights, isWeights);
  useEffect(() => { const element = root.current; if (!element) return; const observer = new ResizeObserver(() => setWidth(element.clientWidth)); observer.observe(element); setWidth(element.clientWidth); return () => observer.disconnect(); }, []);
  const tabbed = layout.mode === 'tabs' || width < 1000;
  const shown = expanded ? ['notes'] as ReadingPaneId[] : tabbed ? [layout.active] : order.filter(id => !layout.hidden.includes(id));
  const total = Math.max(width - (shown.length - 1) * 1, shown.reduce((sum, id) => sum + readingMinimums[id], 0));
  const sizes = allocatePanes(total, shown, weights);
  const move = (id: ReadingPaneId, target: ReadingPaneId) => setOrder(previous => movePane(previous, id, target));
  const activate = (id: ReadingPaneId) => { onRestore?.(); layout.open(id); };
  const close = (id: ReadingPaneId) => { layout.setHidden(previous => [...new Set([...previous, id])]); layout.setActive('document'); };
  return <div className="reading-workspace">
    <div className="reading-workspace-bar"><div role="tablist" aria-label="阅读分页" aria-multiselectable={!tabbed}>
      {order.map(id => { const Icon = icons[id], visible = shown.includes(id); return <button key={id} id={`reading-tab-${id}`} role="tab" aria-controls={`reading-pane-${id}`} aria-selected={tabbed ? layout.active === id : visible} tabIndex={layout.active === id ? 0 : -1} className={visible ? 'active' : ''} onClick={() => activate(id)} onKeyDown={event => {
        const index = order.indexOf(id), target = event.key === 'ArrowRight' ? order[(index + 1) % order.length] : event.key === 'ArrowLeft' ? order[(index + order.length - 1) % order.length] : event.key === 'Home' ? order[0] : event.key === 'End' ? order.at(-1) : null;
        if (!target) return; event.preventDefault(); event.stopPropagation(); activate(target); window.document.getElementById(`reading-tab-${target}`)?.focus();
      }}><Icon size={14}/>{labels[id]}<span className="reading-pane-indicator"/></button>; })}
    </div><button className="reading-layout-toggle" disabled={width < 1000} aria-label={width < 1000 ? '窄窗口自动分页' : layout.mode === 'split' ? '切换为分页阅读' : '切换为三栏并排'} title={width < 1000 ? '窄窗口自动分页；放大窗口可三栏并排' : '切换阅读布局'} onClick={() => { layout.setMode(layout.mode === 'split' ? 'tabs' : 'split'); layout.setHidden([]); }}>{layout.mode === 'split' ? <PanelTop size={14}/> : <Columns3 size={14}/>}<span>{tabbed ? '分页阅读' : '三栏并排'}</span></button></div>
    <div ref={root} className={`reading-workspace-panes ${expanded ? 'note-expanded' : ''}`}>
      {readingPaneIds.map(id => {
        const index = shown.indexOf(id), next = shown[index + 1], visible = index >= 0, Icon = icons[id];
        return <section key={id} id={`reading-pane-${id}`} role="tabpanel" aria-labelledby={`reading-tab-${id}`} hidden={!visible} data-reading-pane={id}
          className={`reading-workspace-pane ${id === 'document' ? 'reading-document-pane' : id === 'notes' ? 'paper-note-pane reading-sidebar' : 'reading-ai-pane reading-sidebar'}`}
          style={{ order: order.indexOf(id), width: tabbed || expanded ? '100%' : sizes[id], '--pane-width': `${sizes[id]}px` } as CSSProperties}>
          <header className="reading-pane-heading"><Icon size={14}/><strong>{labels[id]}</strong><PanelPositionHandle label={`移动${labels[id]}分页位置`} onStep={direction => { const adjacent = order[order.indexOf(id) + (direction === 'left' ? -1 : 1)]; if (adjacent) move(id, adjacent); }} onDrop={x => {
            if (tabbed) {
              const tabs = [...(root.current?.parentElement?.querySelectorAll<HTMLElement>('[role=tab]') || [])];
              const nearest = tabs.sort((a,b)=>Math.abs(a.getBoundingClientRect().x+a.clientWidth/2-x)-Math.abs(b.getBoundingClientRect().x+b.clientWidth/2-x))[0];
              if (nearest) move(id, nearest.id.replace('reading-tab-', '') as ReadingPaneId); return;
            }
            const candidates = [...(root.current?.querySelectorAll<HTMLElement>('[data-reading-pane]') || [])].filter(element => !element.hidden);
            const target = candidates.find(element => { const rect = element.getBoundingClientRect(); return x >= rect.left && x <= rect.right; });
            if (target) move(id, target.dataset.readingPane as ReadingPaneId);
          }}/>{id !== 'document' && !expanded && <button className="icon-button" aria-label={`收起${labels[id]}分页`} title={`收起${labels[id]}`} onClick={() => close(id)}><X size={14}/></button>}</header>
          {id === 'document' ? document : id === 'notes' ? notes : ai(visible)}
          {visible && next && !tabbed && !expanded && <PanelResizeHandle label={`调整${labels[id]}与${labels[next]}分栏`} value={sizes[id]} min={readingMinimums[id]} max={sizes[id] + sizes[next] - readingMinimums[next]} reset={(sizes[id] + sizes[next]) / 2} onChange={size => setWeights(previous => ({ ...previous, ...Object.fromEntries(shown.map(pane => [pane, (pane === id ? size : pane === next ? sizes[id] + sizes[next] - size : sizes[pane]) / total])) }))}/>}
        </section>;
      })}
    </div>
  </div>;
}
