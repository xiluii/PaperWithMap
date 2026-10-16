import { useState } from 'react';
import { X } from 'lucide-react';
import type { HandwrittenNote, InkStroke, PdfAnnotations, PdfPageInk } from '../types';
import { pdfBaseUrl } from '../backend';
import { placeNoteInk } from '../pdf-ink';
import type { ContextMenuItem } from '../context-menu';
import InkCanvas from './InkCanvas';
import type { InkTool } from './InkCanvas';
import ContinuousPdf from './ContinuousPdf';
import type { PdfPageView } from './ContinuousPdf';

const empty:InkStroke[]=[];
type Props={fileId:string;annotations:PdfAnnotations;onChange:(page:number,value:PdfPageInk)=>void;tool:InkTool|'read';color:string;width:number;pressure:boolean;penOnly:boolean;inserting:HandwrittenNote|null;onInserted:()=>void;contextItems?:ContextMenuItem[]};
export default function AnnotatedPdf({fileId,annotations,onChange,tool,color,width,pressure,penOnly,inserting,onInserted,contextItems}:Props){
  return <ContinuousPdf contextItems={contextItems} url={pdfBaseUrl(fileId)} banner={inserting&&<div className="pdf-insert-banner"><span>点击任一 PDF 页面，放入「{inserting.title}」的 {inserting.strokes.length} 笔墨迹</span><button aria-label="取消放入笔迹" className="icon-button" onClick={onInserted}><X size={14}/></button></div>} renderOverlay={view=><PageInk key={view.pageNumber} view={view} strokes={annotations.pages[String(view.pageNumber)]?.strokes||empty} onChange={strokes=>onChange(view.pageNumber,{...view.geometry,strokes})} tool={tool} color={color} width={width} pressure={pressure} penOnly={penOnly} inserting={inserting} onInserted={onInserted}/>} renderFooter={(page,total)=><><span>{tool==='read'?'连续滚动阅读':tool==='eraser'?'划过墨迹，擦除整笔':tool==='highlighter'?'荧光笔 · 滚轮继续阅读':'直接在页面上书写 · 滚轮继续阅读'}</span><span>第 {page} / {total||'—'} 页 <i>·</i> 本页 {annotations.pages[String(page)]?.strokes.length||0} 笔</span></>}/>;
}

function PageInk({view,strokes,onChange,tool,color,width,pressure,penOnly,inserting,onInserted}:{view:PdfPageView;strokes:InkStroke[];onChange:(strokes:InkStroke[])=>void;tool:InkTool|'read';color:string;width:number;pressure:boolean;penOnly:boolean;inserting:HandwrittenNote|null;onInserted:()=>void}){
  const [cursor,setCursor]=useState<{x:number;y:number}|null>(null);
  return <><div className={`pdf-ink-overlay ${tool==='read'||inserting?'pdf-ink-passive':''}`}><InkCanvas strokes={strokes} tool={tool==='read'?'pen':tool} color={color} width={width} pressure={pressure} penOnly={penOnly} fixedViewport={{x:0,y:0,zoom:view.scale}} ariaLabel={`PDF 第 ${view.pageNumber} 页批注画布`} onChange={onChange} onZoom={()=>{}} onInput={()=>{}}/></div>{inserting&&<div className="pdf-place-layer" aria-label={`在第 ${view.pageNumber} 页放置已有笔迹`} onPointerMove={e=>{const r=e.currentTarget.getBoundingClientRect();setCursor({x:e.clientX-r.left,y:e.clientY-r.top});}} onPointerLeave={()=>setCursor(null)} onClick={e=>{const r=e.currentTarget.getBoundingClientRect();onChange([...strokes,...placeNoteInk(inserting.strokes,view.geometry.width,view.geometry.height,(e.clientX-r.left)/view.scale,(e.clientY-r.top)/view.scale)]);setCursor(null);onInserted();}}>{cursor&&<span className="pdf-placement-cursor" style={{left:cursor.x,top:cursor.y}}>＋ 放在这里</span>}</div>}</>;
}
