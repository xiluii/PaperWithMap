import { useEffect, useRef, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { BookOpen, ChevronDown, Columns3, LayoutPanelLeft, MessageSquare, PanelTop, PenLine, RotateCcw, X } from 'lucide-react';
import { allocatePanes, defaultReadingWeights, movePane, readingMinimums, readingPaneIds, validPaneOrder } from '../panel-layout';
import type { ReadingPaneId } from '../panel-layout';
import { PanelPositionHandle, PanelResizeHandle, useLayoutPreference } from './PanelControls';
import { studyDimensions } from '../floating-layout';

const names = { document: '论文', notes: '手写笔记', ai: 'AI 对话' }, icons = { document: BookOpen, notes: PenLine, ai: MessageSquare };
const isOrder = (value: unknown): value is ReadingPaneId[] => JSON.stringify(validPaneOrder(value)) === JSON.stringify(value);
const isWeights = (value: unknown): value is typeof defaultReadingWeights => !!value && typeof value === 'object' && readingPaneIds.every(id => typeof (value as Record<string, unknown>)[id] === 'number' && Number.isFinite((value as Record<string, number>)[id]) && (value as Record<string, number>)[id] > 0 && (value as Record<string, number>)[id] <= 1);

export function useReadingWorkspace() {
  const [active, setActive] = useState<ReadingPaneId>('document'), [hidden, setHidden] = useState<ReadingPaneId[]>([]);
  const [mode, setMode] = useLayoutPreference<'split' | 'tabs' | 'study'>('reader-mode', 'study', (value): value is 'split' | 'tabs' | 'study' => value === 'split' || value === 'tabs' || value === 'study');
  const open = (pane: ReadingPaneId) => { setHidden(previous => previous.filter(id => id !== pane)); setActive(pane); };
  return { active, setActive, hidden, setHidden, mode, setMode, open };
}
export type ReadingLayout = ReturnType<typeof useReadingWorkspace>;
export default function ReadingWorkspace({ layout, document, notes, ai, expanded = false, documentLabel = '论文', onRestore }: { layout: ReadingLayout; document: ReactNode; notes: ReactNode; ai: (visible: boolean) => ReactNode; expanded?: boolean; documentLabel?: string; onRestore?: () => void }) {
  const labels = {...names, document: documentLabel};
  const root = useRef<HTMLDivElement>(null), [width, setWidth] = useState(1200), [height, setHeight] = useState(700), [menu, setMenu] = useState(false);
  const [order, setOrder] = useLayoutPreference('reader-order', [...readingPaneIds], isOrder);
  const [weights, setWeights] = useLayoutPreference('reader-weights', defaultReadingWeights, isWeights);
  const [columnRatio, setColumnRatio] = useLayoutPreference('reader-study-column', .56, (v): v is number => typeof v === 'number' && Number.isFinite(v) && v >= .15 && v <= .85);
  const [rowRatio, setRowRatio] = useLayoutPreference('reader-study-row', .5, (v): v is number => typeof v === 'number' && Number.isFinite(v) && v >= .05 && v <= .95);
  useEffect(() => { const element = root.current; if (!element) return; const measure = () => { setWidth(element.clientWidth); setHeight(element.clientHeight); }; const observer = new ResizeObserver(measure); observer.observe(element); measure(); return () => observer.disconnect(); }, []);
  const tabbed = layout.mode === 'tabs' || width < (layout.mode === 'study' ? 760 : 1000);
  const shown = expanded ? ['notes'] as ReadingPaneId[] : tabbed ? [layout.active] : order.filter(id => !layout.hidden.includes(id));
  const total = Math.max(width - (shown.length - 1) * 1, shown.reduce((sum, id) => sum + readingMinimums[id], 0));
  const sizes = allocatePanes(total, shown, weights);
  const study = layout.mode === 'study' && !tabbed && !expanded && shown.length > 1;
  const main = shown[0], top = shown[1], bottom = shown[2];
  const studySize = studyDimensions(width, height, columnRatio, rowRatio, readingMinimums[main], Math.max(...shown.slice(1).map(id => readingMinimums[id])), top === 'ai' ? 260 : 180, bottom === 'ai' ? 260 : 180);
  const move = (id: ReadingPaneId, target: ReadingPaneId) => setOrder(previous => movePane(previous, id, target));
  const activate = (id: ReadingPaneId) => { onRestore?.(); layout.open(id); };
  const close = (id: ReadingPaneId) => { layout.setHidden(previous => [...new Set([...previous, id])]); layout.setActive('document'); };
  return <div className={`reading-workspace ${tabbed ? 'is-tabbed' : 'is-parallel'}`}>
    <div className="reading-workspace-bar"><div role="tablist" aria-label="阅读分页" aria-multiselectable={!tabbed}>
      {order.map(id => { const Icon = icons[id], visible = shown.includes(id); return <button key={id} id={`reading-tab-${id}`} role="tab" aria-controls={`reading-pane-${id}`} aria-selected={tabbed ? layout.active === id : visible} tabIndex={layout.active === id ? 0 : -1} className={visible ? 'active' : ''} onClick={() => activate(id)} onKeyDown={event => {
        const index = order.indexOf(id), target = event.key === 'ArrowRight' ? order[(index + 1) % order.length] : event.key === 'ArrowLeft' ? order[(index + order.length - 1) % order.length] : event.key === 'Home' ? order[0] : event.key === 'End' ? order.at(-1) : null;
        if (!target) return; event.preventDefault(); event.stopPropagation(); activate(target); window.document.getElementById(`reading-tab-${target}`)?.focus();
      }}><Icon size={14}/>{labels[id]}<span className="reading-pane-indicator"/></button>; })}
    </div><div className="reading-layout-options"><button className="reading-layout-toggle" aria-label="阅读布局" aria-expanded={menu} title="阅读布局" onClick={() => setMenu(v => !v)}>{layout.mode === 'study' ? <LayoutPanelLeft size={14}/> : layout.mode === 'split' ? <Columns3 size={14}/> : <PanelTop size={14}/>}<span>{tabbed ? '分页' : study ? '研究工作区' : '三栏'}</span><ChevronDown size={12}/></button>{menu && <div className="dropdown reading-layout-menu">{([{id:'study',label:'论文 + 白板 / AI',icon:LayoutPanelLeft,min:760},{id:'split',label:'三栏并排',icon:Columns3,min:1000},{id:'tabs',label:'独立分页',icon:PanelTop,min:0}] as const).map(item => <button key={item.id} disabled={width < item.min} aria-pressed={layout.mode === item.id} onClick={() => { layout.setMode(item.id); layout.setHidden([]); setMenu(false); onRestore?.(); }}><item.icon size={15}/>{item.label}</button>)}<details className="reading-size-settings"><summary>调整分栏大小</summary>{study ? <>{<label>{labels[main]}宽度<input type="range" aria-label="主栏宽度" min={readingMinimums[main]} max={width-Math.max(...shown.slice(1).map(id=>readingMinimums[id]))-1} value={studySize.main} onChange={event=>setColumnRatio(Number(event.target.value)/(width-1))}/></label>}{bottom&&<label>上下分栏<input type="range" aria-label="上方分栏高度" min={studySize.minRow} max={studySize.maxRow} value={studySize.top} onChange={event=>setRowRatio(Number(event.target.value)/(height-1))}/></label>}</> : !tabbed&&shown.slice(0,-1).map((id,index)=>{const next=shown[index+1],pair=sizes[id]+sizes[next];return <label key={id}>{labels[id]}宽度<input type="range" aria-label={`${labels[id]}分栏宽度`} min={readingMinimums[id]} max={pair-readingMinimums[next]} value={sizes[id]} onChange={event=>{const size=Number(event.target.value);setWeights(previous=>({...previous,...Object.fromEntries(shown.map(pane=>[pane,(pane===id?size:pane===next?pair-size:sizes[pane])/total]))}));}}/></label>;})}{tabbed&&<small>并排布局可调节分栏大小。</small>}</details><button onClick={() => { setWeights(defaultReadingWeights); setColumnRatio(.56); setRowRatio(.5); setMenu(false); }}><RotateCcw size={14}/>还原分栏大小</button></div>}</div></div>
    <div ref={root} className={`reading-workspace-panes ${study ? 'study-layout' : ''} ${expanded ? 'note-expanded' : ''}`} style={study ? {gridTemplateColumns:`${studySize.main}px ${studySize.side}px`,gridTemplateRows:bottom ? `${studySize.top}px ${studySize.bottom}px` : 'minmax(0,1fr)'} : undefined}>
      {readingPaneIds.map(id => {
        const index = shown.indexOf(id), next = shown[index + 1], visible = index >= 0, Icon = icons[id];
        return <section key={id} id={`reading-pane-${id}`} role="tabpanel" aria-labelledby={`reading-tab-${id}`} hidden={!visible} data-reading-pane={id}
          className={`reading-workspace-pane ${id === 'document' ? 'reading-document-pane' : id === 'notes' ? 'paper-note-pane reading-sidebar' : 'reading-ai-pane reading-sidebar'}`}
          style={{ order: order.indexOf(id), width: study || tabbed || expanded ? '100%' : sizes[id], '--pane-width': `${sizes[id]}px`, ...(study ? {gridColumn:id === main ? 1 : 2,gridRow:id === main ? '1 / -1' : id === top ? 1 : 2} : {}) } as CSSProperties}>
          <header className="reading-pane-heading"><Icon size={14}/><strong>{labels[id]}</strong><PanelPositionHandle label={`移动${labels[id]}分页位置`} onStep={direction => { const adjacent = order[order.indexOf(id) + (direction === 'left' ? -1 : 1)]; if (adjacent) move(id, adjacent); }} onDrop={(x,y) => {
            if (tabbed) {
              const tabs = [...(root.current?.parentElement?.querySelectorAll<HTMLElement>('[role=tab]') || [])];
              const nearest = tabs.sort((a,b)=>Math.abs(a.getBoundingClientRect().x+a.clientWidth/2-x)-Math.abs(b.getBoundingClientRect().x+b.clientWidth/2-x))[0];
              if (nearest) move(id, nearest.id.replace('reading-tab-', '') as ReadingPaneId); return;
            }
            const candidates = [...(root.current?.querySelectorAll<HTMLElement>('[data-reading-pane]') || [])].filter(element => !element.hidden);
            const target = candidates.find(element => { const rect = element.getBoundingClientRect(); return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom; });
            if (target) move(id, target.dataset.readingPane as ReadingPaneId);
          }}/>{id !== 'document' && !expanded && <button className="icon-button" aria-label={`收起${labels[id]}分页`} title={`收起${labels[id]}`} onClick={() => close(id)}><X size={14}/></button>}</header>
          {id === 'document' ? document : id === 'notes' ? notes : ai(visible)}
          {visible && study && id === main && <PanelResizeHandle label={`调整${labels[id]}与侧栏宽度`} value={studySize.main} min={readingMinimums[main]} max={width - Math.max(...shown.slice(1).map(pane => readingMinimums[pane])) - 1} reset={(width - 1) * .56} onChange={size => setColumnRatio(size / (width - 1))}/>}
          {visible && study && id === top && bottom && <PanelResizeHandle axis="y" label={`调整${labels[top]}与${labels[bottom]}高度`} value={studySize.top} min={studySize.minRow} max={studySize.maxRow} reset={(height - 1) / 2} onChange={size => setRowRatio(size / (height - 1))}/>}
          {visible && next && !tabbed && !expanded && !study && <PanelResizeHandle label={`调整${labels[id]}与${labels[next]}分栏`} value={sizes[id]} min={readingMinimums[id]} max={sizes[id] + sizes[next] - readingMinimums[next]} reset={(sizes[id] + sizes[next]) / 2} onChange={size => setWeights(previous => ({ ...previous, ...Object.fromEntries(shown.map(pane => [pane, (pane === id ? size : pane === next ? sizes[id] + sizes[next] - size : sizes[pane]) / total])) }))}/>}
        </section>;
      })}
    </div>
  </div>;
}
