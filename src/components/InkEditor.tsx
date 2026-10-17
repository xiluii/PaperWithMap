import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowUpRight, ArrowUpRight as ArrowShape, Square, Check, Download, Eraser, Hand, Highlighter, Link2, Maximize2, Minus, PanelRightOpen, PenLine, PenTool, Plus, Redo2, Scan, SlidersHorizontal, Trash2, Undo2 } from 'lucide-react';
import type { HandwrittenNote, InkStroke, InkTheme } from '../types';
import { drawStroke, inkBounds, INK_THEMES } from '../ink-model';
import { safeFilename } from '../model';
import InkCanvas from './InkCanvas';
import type { InkCanvasHandle, InkTool } from './InkCanvas';
import { Modal } from './Dialogs';
import FocusModeButton from './FocusModeButton';
import useFocusMode from '../useFocusMode';
import ThemeControl from './ThemeControl';
import FloatingToolbar from './FloatingToolbar';
import { useContextMenu } from './ContextMenu';
import { menuSeparator } from '../context-menu';

type InkFrame={strokes:InkStroke[];theme:InkTheme};
type Props={note:HandwrittenNote;embedded?:boolean;saveState:'saving'|'saved'|'error';anchorTitle?:string;boardTitle?:string;onUpdate:(patch:Partial<HandwrittenNote>)=>void;onClose:()=>void;onLink:()=>void;onLocate:()=>void;onPresentation:()=>void;onInsertToPdf?:()=>void};
function inkPreferences():{width:number;pressure:boolean;penOnly:boolean}{try{const value=JSON.parse(localStorage.getItem('paperly:ink-preferences')||'{}');return {width:typeof value.width==='number'?Math.min(12,Math.max(1,value.width)):3,pressure:typeof value.pressure==='boolean'?value.pressure:true,penOnly:typeof value.penOnly==='boolean'?value.penOnly:false};}catch{return {width:3,pressure:true,penOnly:false};}}
export default function InkEditor({note,embedded=false,saveState,anchorTitle,boardTitle,onUpdate,onClose,onLink,onLocate,onPresentation,onInsertToPdf}:Props){
  const contextMenu=useContextMenu();
  const [preferences]=useState(inkPreferences);
  const [tool,setTool]=useState<InkTool>('pen');
  const [color,setColor]=useState(INK_THEMES[note.theme].foreground);
  const [width,setWidth]=useState(preferences.width);
  const [pressure,setPressure]=useState(preferences.pressure);
  const [penOnly,setPenOnly]=useState(preferences.penOnly);
  const [settings,setSettings]=useState(false);
  const [clearDialog,setClearDialog]=useState(false);
  const [zoom,setZoom]=useState(1);
  const [input,setInput]=useState({type:'',pressure:0});
  const [,setHistoryVersion]=useState(0);
  const canvas=useRef<InkCanvasHandle>(null);
  const editor=useRef<HTMLElement>(null);
  useEffect(()=>{if(!embedded)editor.current?.focus({preventScroll:true});},[embedded]);
  const focus=useFocusMode(embedded?'split-note':'note',()=>canvas.current?.finish());
  const current=useRef(note);current.current=note;
  const update=useRef(onUpdate);update.current=onUpdate;
  const history=useRef<{past:InkFrame[];future:InkFrame[]}>({past:[],future:[]});
  useEffect(()=>{try{localStorage.setItem('paperly:ink-preferences',JSON.stringify({width,pressure,penOnly}));}catch{/* Ink is still persisted in the workspace when preference storage is unavailable. */}},[width,pressure,penOnly]);
  const changeInk=useCallback((strokes:InkStroke[],theme:InkTheme=current.current.theme)=>{const previous=current.current;history.current.past.push({strokes:previous.strokes,theme:previous.theme});history.current.past=history.current.past.slice(-60);history.current.future=[];current.current={...previous,strokes,theme};update.current({strokes,theme});setHistoryVersion(v=>v+1);},[]);
  const undo=()=>{canvas.current?.finish();const previous=history.current.past.pop();if(!previous)return;history.current.future.push({strokes:current.current.strokes,theme:current.current.theme});current.current={...current.current,...previous};onUpdate(previous);setColor(INK_THEMES[previous.theme].foreground);setHistoryVersion(v=>v+1);};
  const redo=()=>{canvas.current?.finish();const next=history.current.future.pop();if(!next)return;history.current.past.push({strokes:current.current.strokes,theme:current.current.theme});current.current={...current.current,...next};onUpdate(next);setColor(INK_THEMES[next.theme].foreground);setHistoryVersion(v=>v+1);};
  const changeTheme=(theme:InkTheme)=>{if(note.theme===theme)return;canvas.current?.finish();const previous=INK_THEMES[note.theme],next=INK_THEMES[theme];const strokes=note.strokes.map(stroke=>{const index=previous.colors.indexOf(stroke.color);return index<0?stroke:{...stroke,color:next.colors[index]};});const index=previous.colors.indexOf(color);setColor(index<0?next.foreground:next.colors[index]);changeInk(strokes,theme);};
  const exportImage=()=>{canvas.current?.finish();const strokes=current.current.strokes,bounds=inkBounds(strokes),padding=60;const scale=Math.min(2,4096/(bounds.width+padding*2),4096/(bounds.height+padding*2));const output=document.createElement('canvas');output.width=Math.ceil((bounds.width+padding*2)*scale);output.height=Math.ceil((bounds.height+padding*2)*scale);const context=output.getContext('2d');if(!context)return;context.fillStyle=INK_THEMES[current.current.theme].background;context.fillRect(0,0,output.width,output.height);context.setTransform(scale,0,0,scale,(padding-bounds.x)*scale,(padding-bounds.y)*scale);strokes.forEach(stroke=>drawStroke(context,stroke));output.toBlob(blob=>{if(!blob)return;const url=URL.createObjectURL(blob),anchor=document.createElement('a');anchor.href=url;anchor.download=safeFilename(current.current.title)+'.png';anchor.click();setTimeout(()=>URL.revokeObjectURL(url),1000);});};
  const theme=INK_THEMES[note.theme];
  const openInkMenu=(event:React.MouseEvent)=>{
    if(!(event.target as Element).closest('.ink-surface'))return;
    canvas.current?.finish();
    const choose=(value:InkTool)=>{canvas.current?.finish();setTool(value);};
    contextMenu.open(event,'手写画布',[
      {id:'undo',label:'撤销笔画',icon:Undo2,shortcut:'Ctrl+Z',disabled:!history.current.past.length,onSelect:undo},
      {id:'redo',label:'重做笔画',icon:Redo2,shortcut:'Ctrl+Shift+Z',disabled:!history.current.future.length,onSelect:redo},menuSeparator,
      {id:'pen',label:'钢笔',icon:PenLine,shortcut:'B',checked:tool==='pen',onSelect:()=>choose('pen')},
      {id:'highlight',label:'荧光笔',icon:Highlighter,checked:tool==='highlighter',onSelect:()=>choose('highlighter')},
      {id:'eraser',label:'笔画橡皮',icon:Eraser,shortcut:'E',checked:tool==='eraser',onSelect:()=>choose('eraser')},
      {id:'rectangle',label:'矩形框',icon:Square,shortcut:'R',checked:tool==='rectangle',onSelect:()=>choose('rectangle')},
      {id:'arrow',label:'箭头',icon:ArrowShape,shortcut:'A',checked:tool==='arrow',onSelect:()=>choose('arrow')},
      {id:'hand',label:'抓手',icon:Hand,shortcut:'H',checked:tool==='hand',onSelect:()=>choose('hand')},menuSeparator,
      {id:'fit',label:'显示全部笔迹',icon:Scan,onSelect:()=>canvas.current?.fit()},
      {id:'focus',label:'专注书写',icon:Maximize2,checked:focus.focused,onSelect:focus.toggle},
      {id:'link',label:'关联卡片',icon:Link2,onSelect:onLink},menuSeparator,
      ...(['light','dark','green'] as InkTheme[]).map(value=>({id:value,label:INK_THEMES[value].name,checked:note.theme===value,onSelect:()=>changeTheme(value)})),menuSeparator,
      {id:'clear',label:'清空画布…',icon:Trash2,danger:true,disabled:!note.strokes.length,onSelect:()=>setClearDialog(true)},
    ]);
  };
  return <section onContextMenu={openInkMenu} ref={editor} tabIndex={-1} className={`ink-editor ink-theme-${note.theme} ${embedded?'ink-embedded':''} ${focus.focused?'ink-focused':''}`} aria-label={`手写笔记：${note.title}`} style={{'--ink-background':theme.background,'--ink-foreground':theme.foreground} as React.CSSProperties} onKeyDown={event=>{
    focus.onKeyDown(event);
    if(event.defaultPrevented||(event.target as HTMLElement).closest('[role="dialog"]')!==event.currentTarget.closest('[role="dialog"]')||(event.target as HTMLElement).closest('input,textarea,select,[contenteditable="true"]'))return;
    if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='z'){event.preventDefault();event.stopPropagation();if(event.shiftKey)redo();else undo();}
    else if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='y'){event.preventDefault();event.stopPropagation();redo();}
    else if(!event.ctrlKey&&!event.metaKey&&['b','e','h','r','a'].includes(event.key.toLowerCase())){event.preventDefault();event.stopPropagation();setTool(event.key.toLowerCase()==='b'?'pen':event.key.toLowerCase()==='e'?'eraser':event.key.toLowerCase()==='r'?'rectangle':event.key.toLowerCase()==='a'?'arrow':'hand');}
  }}>
    <header className="ink-editor-header"><button className="ink-icon-button" aria-label={embedded?'关闭分屏笔记':'返回手写笔记库'} title={embedded?'关闭分屏':'返回笔记库'} onClick={()=>{canvas.current?.finish();onClose();}}><ArrowLeft size={17}/></button><span className="ink-header-icon"><PenLine size={18}/></span><div className="ink-title-block"><input aria-label="手写笔记名称" value={note.title} maxLength={100} placeholder="未命名笔记" onChange={event=>onUpdate({title:event.target.value})} onBlur={()=>{if(!note.title.trim())onUpdate({title:'未命名笔记'});}}/><span><i className={saveState==='saved'?'saved':''}/>{saveState==='saving'?'正在保存笔迹':saveState==='error'?'保存失败，请导出备份':'已保存在本地'}</span></div><div className="ink-header-actions">{onInsertToPdf&&<button className="ink-icon-button" title="将笔迹放入左侧 PDF" aria-label="将此笔记放入 PDF" disabled={!note.strokes.length} onClick={()=>{canvas.current?.finish();onInsertToPdf();}}><ArrowUpRight size={17}/></button>}<button className="ink-icon-button" title="导出 PNG 图片" aria-label="导出手写笔记图片" onClick={exportImage}><Download size={16}/></button><button className="ink-icon-button" title={embedded?'完整打开':'分屏查看白板'} aria-label={embedded?'完整打开手写笔记':'分屏查看白板'} onClick={()=>{canvas.current?.finish();onPresentation();}}>{embedded?<Maximize2 size={16}/>:<PanelRightOpen size={17}/>}</button></div></header>
    <div className="ink-anchor-bar"><Link2 size={12}/>{anchorTitle?<button className="ink-anchor-link" onClick={onLocate} title={`定位到 ${boardTitle} · ${anchorTitle}`}><span>{anchorTitle}</span><ArrowUpRight size={12}/></button>:<span className="ink-anchor-empty">自由笔记 · 尚未关联卡片</span>}<button className="ink-anchor-edit" onClick={onLink}>{anchorTitle?'更改关联':'+ 关联卡片'}</button></div>
    <div className="ink-writing-area"><InkCanvas ref={canvas} strokes={note.strokes} tool={tool} color={color} width={width} pressure={pressure} penOnly={penOnly} onChange={changeInk} onZoom={setZoom} onInput={(type,pressure)=>setInput({type,pressure})}/>
      <div className="ink-focus-control"><FocusModeButton focused={focus.focused} onToggle={focus.toggle} label="专注书写"/><ThemeControl/></div>
      {!note.strokes.length&&<div className="ink-first-mark"><PenLine size={22}/><small>书写，或用矩形与箭头梳理思路</small></div>}
      <FloatingToolbar label="白板工具栏" storageKey="ink-dock" className="ink-dock"><div className="ink-tools">{([{value:'pen',icon:PenLine,label:'钢笔 (B)'},{value:'highlighter',icon:Highlighter,label:'荧光笔'},{value:'eraser',icon:Eraser,label:'笔画橡皮 (E)'},{value:'rectangle',icon:Square,label:'矩形框 (R)'},{value:'arrow',icon:ArrowShape,label:'箭头 (A)'},{value:'hand',icon:Hand,label:'抓手 (H)'}] as const).map(item=><button key={item.value} title={item.label} aria-label={item.label} aria-pressed={tool===item.value} className={tool===item.value?'active':''} onClick={()=>{canvas.current?.finish();setTool(item.value);}}><item.icon size={19}/></button>)}<i/><button title="撤销笔画 (Ctrl+Z)" aria-label="撤销笔画" disabled={!history.current.past.length} onClick={undo}><Undo2 size={17}/></button><button title="重做笔画 (Ctrl+Shift+Z)" aria-label="重做笔画" disabled={!history.current.future.length} onClick={redo}><Redo2 size={17}/></button><i/><button title="书写设置" aria-label="书写设置" aria-expanded={settings} className={settings?'active':''} onClick={()=>setSettings(value=>!value)}><SlidersHorizontal size={17}/></button></div><div className="ink-pens"><div className="ink-colors">{theme.colors.map(ink=><button key={ink} aria-label={`使用墨色 ${ink}`} title={ink} className={color===ink?'active':''} style={{background:ink}} onClick={()=>{setColor(ink);if(tool==='eraser'||tool==='hand')setTool('pen');}}>{color===ink&&<Check size={10} color={note.theme==='light'?'#fff':'#243327'}/>}</button>)}<label className="ink-custom-color" title="自定义墨色"><Plus size={11}/><input type="color" aria-label="自定义墨色" value={color} onChange={event=>setColor(event.target.value)}/></label></div><i/><label className="ink-width"><input type="range" aria-label="笔画粗细" min="1" max="12" step=".5" value={width} onChange={event=>setWidth(Number(event.target.value))}/><span>{width}<small>px</small></span></label></div>
<div className="ink-dock-secondary">      <div className="ink-theme-picker" aria-label="画布背景"><span>底色</span>{(Object.entries(INK_THEMES) as [InkTheme,typeof theme][]).map(([key,value])=><button key={key} aria-label={`切换为${value.name}背景`} title={value.name} className={note.theme===key?'active':''} style={{background:value.background,color:value.foreground}} onClick={()=>changeTheme(key)}>{note.theme===key&&<Check size={11}/>}</button>)}</div>      <div className="ink-zoom"><button className="ink-icon-button" aria-label="缩小手写画布" title="缩小" onClick={()=>canvas.current?.zoomBy(1/1.2)}><Minus size={14}/></button><button className="ink-zoom-value" title="重置缩放" onClick={()=>canvas.current?.reset()}>{Math.round(zoom*100)}<small>%</small></button><button className="ink-icon-button" aria-label="放大手写画布" title="放大" onClick={()=>canvas.current?.zoomBy(1.2)}><Plus size={14}/></button><i/><button className="ink-icon-button" aria-label="显示全部笔迹" title="显示全部笔迹" onClick={()=>canvas.current?.fit()}><Scan size={15}/></button></div></div>
      {settings&&<div className="ink-settings"><div><span>书写设置</span><button className="ink-icon-button" aria-label="关闭书写设置" onClick={()=>setSettings(false)}><Check size={15}/></button></div><button className="ink-setting-row" role="switch" aria-checked={pressure} onClick={()=>setPressure(value=>!value)}><span><b>压感笔迹</b><small>随手写笔力度自然变化</small></span><span className={`ink-toggle ${pressure?'enabled':''}`}><i/></span></button><button className="ink-setting-row" role="switch" aria-checked={penOnly} onClick={()=>setPenOnly(value=>!value)}><span><b>仅手写笔输入</b><small>忽略鼠标与手指，减少误触</small></span><span className={`ink-toggle ${penOnly?'enabled':''}`}><i/></span></button><div className="ink-settings-divider"/><button className="ink-setting-row" onClick={onLink}><Link2 size={14}/>关联卡片</button><button className="ink-clear-button" disabled={!note.strokes.length} onClick={()=>{setSettings(false);setClearDialog(true);}}><Trash2 size={14}/>清空当前画布<span>可撤销</span></button></div>}
</FloatingToolbar>
    </div><footer className="ink-editor-status"><span>{input.type==='pen'?<PenTool size={11}/>:<PenLine size={11}/>}<span>{penOnly?'仅手写笔模式':input.type==='pen'?'手写笔 · 真实压感':input.type==='mouse'?'鼠标 · 模拟压感':'支持数位板与手写笔'}</span></span><span>{note.strokes.length} 笔<span className="ink-status-separator">·</span>空格平移<span className="ink-status-separator">·</span>Ctrl + 滚轮缩放</span></footer>
    {clearDialog&&<Modal title="让画布重新留白？" onClose={()=>setClearDialog(false)}><div className="confirm-body"><p>将清空当前笔记中的 {note.strokes.length} 个笔画。清空后仍可使用「撤销笔画」恢复。</p><div className="modal-actions"><button className="secondary-button" onClick={()=>setClearDialog(false)}>保留笔迹</button><button className="primary-button" onClick={()=>{changeInk([]);setClearDialog(false);}}>清空画布</button></div></div></Modal>}
  </section>;
}
