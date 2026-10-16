import { useEffect, useId, useRef, useState } from 'react';
import { Check, Maximize, Minimize2, PanelLeft, PanelTop, Settings2 } from 'lucide-react';
import ThemeControl from './ThemeControl';

export type CanvasChrome = { sidebar: boolean; topbar: boolean };

export default function CanvasChromeControls({chrome,onChange,onFocus}:{
  chrome: CanvasChrome;
  onChange: (chrome: CanvasChrome) => void;
  onFocus: () => void;
}) {
  const [open,setOpen]=useState(false);
  const root=useRef<HTMLDivElement>(null);
  const trigger=useRef<HTMLButtonElement>(null);
  const panelId=useId();
  const focused=!chrome.sidebar&&!chrome.topbar;

  useEffect(()=>{
    if(!open)return;
    const outside=(event:PointerEvent)=>{
      if(!root.current?.contains(event.target as Node))setOpen(false);
    };
    const escape=(event:KeyboardEvent)=>{
      if(event.key==='Escape'){
        event.preventDefault();
        event.stopPropagation();
        setOpen(false);
        trigger.current?.focus();
      }
    };
    document.addEventListener('pointerdown',outside);
    document.addEventListener('keydown',escape);
    return()=>{
      document.removeEventListener('pointerdown',outside);
      document.removeEventListener('keydown',escape);
    };
  },[open]);

  return <div ref={root} className="canvas-view-controls">
    {!chrome.topbar&&<ThemeControl/>}
    <button className={`canvas-focus-button ${focused?'is-focused':''}`}
      aria-label={focused?'恢复完整界面':'专注画布'} aria-pressed={focused}
      title={focused?'恢复完整界面 (Shift+F / Esc)':'专注画布：隐藏侧边栏和顶部区域 (Shift+F)'}
      onClick={onFocus}>
      {focused?<Minimize2 size={15}/>:<Maximize size={15}/>}
      <span>{focused?'恢复界面':'专注画布'}</span>
    </button>
    <button ref={trigger} className="canvas-display-button" aria-label="界面显示设置"
      title="界面显示设置" aria-expanded={open} aria-controls={panelId}
      onClick={()=>setOpen(value=>!value)}><Settings2 size={15}/></button>
    {open&&<div id={panelId} className="canvas-display-popover" role="group" aria-label="界面显示">
      <div className="canvas-display-caption">界面显示</div>
      <button role="switch" aria-checked={chrome.sidebar}
        onClick={()=>onChange({...chrome,sidebar:!chrome.sidebar})}>
        <PanelLeft size={15}/><span>侧边栏</span><span className="chrome-check">{chrome.sidebar&&<Check size={13}/>}</span>
      </button>
      <button role="switch" aria-checked={chrome.topbar}
        onClick={()=>onChange({...chrome,topbar:!chrome.topbar})}>
        <PanelTop size={15}/><span>顶部区域</span><span className="chrome-check">{chrome.topbar&&<Check size={13}/>}</span>
      </button>
      <p>Shift + F 切换专注画布<br/>Esc 恢复完整界面</p>
    </div>}
  </div>;
}
