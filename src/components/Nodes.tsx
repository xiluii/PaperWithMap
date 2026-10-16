import { memo, createContext, useContext, useLayoutEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Handle, Position, useUpdateNodeInternals, useReactFlow } from '@xyflow/react';
import type { NodeProps } from '@xyflow/react';
import { ArrowDownRight, ArrowUpRight, BookOpen, Check, FileText, MoreHorizontal, PenLine, Settings2, Sparkles, Star, StickyNote } from 'lucide-react';
import DOMPurify from 'dompurify';
import type { CardAppearance, PaperNode, TextNode, SectionNode } from '../types';
import { STATUS_LABELS } from '../types';
import { CARD_WIDTH, clampCardScale, resolveCardAppearance } from '../card-model';
import { ASSET_LABELS,getAssetKind } from '../asset-model';

export const NodeActions=createContext<{open:(id:string)=>void;star:(id:string)=>void;edit:(id:string)=>void;showNotes:(id:string)=>void;configure:(id:string)=>void;scale:(id:string,value:number)=>void;resizeStart:()=>void;resizeEnd:()=>void;cardDefaults?:CardAppearance;noteCounts:Record<string,number>}>({open:()=>{},star:()=>{},edit:()=>{},showNotes:()=>{},configure:()=>{},scale:()=>{},resizeStart:()=>{},resizeEnd:()=>{},noteCounts:{}});
function CardNoteAction({id,title}:{id:string;title:string}){const actions=useContext(NodeActions);return <div className="card-hover-actions nodrag nopan"><button aria-label={`查看笔记：${title}`} onClick={event=>{event.stopPropagation();actions.showNotes(id);}}><PenLine size={13}/><span>查看笔记</span><b>{actions.noteCounts[id]||0}</b><ArrowUpRight size={11}/></button><button className="card-configure-button" title="卡片显示与缩放" aria-label={`卡片显示设置：${title}`} onClick={event=>{event.stopPropagation();actions.configure(id);}}><Settings2 size={14}/></button></div>;}
export function Ports(){return <>{[['left',Position.Left],['right',Position.Right],['top',Position.Top],['bottom',Position.Bottom]].map(([id,position])=><Handle key={id} id={id} position={position as Position} type="source" className="paper-port" />)}</>;}

function CardShell({id,title,scale,selected,children}:{id:string;title:string;scale:number;selected?:boolean;children:ReactNode}){
  const actions=useContext(NodeActions),latest=useRef(actions);latest.current=actions;
  const content=useRef<HTMLDivElement>(null),[height,setHeight]=useState(280),[resizing,setResizing]=useState(false);
  const {getZoom}=useReactFlow(),updateInternals=useUpdateNodeInternals();
  const gesture=useRef<{pointer:number;x:number;y:number;scale:number;height:number;zoom:number;next:number}|null>(null),frame=useRef(0);
  useLayoutEffect(()=>{const element=content.current;if(!element)return;const measure=()=>setHeight(element.offsetHeight);const observer=new ResizeObserver(measure);observer.observe(element);measure();return()=>observer.disconnect();},[]);
  useLayoutEffect(()=>{updateInternals(id);},[id,height,scale,updateInternals]);
  useLayoutEffect(()=>()=>{if(frame.current)cancelAnimationFrame(frame.current);if(gesture.current)latest.current.resizeEnd();},[]);
  const finish=()=>{const current=gesture.current;if(!current)return;if(frame.current){cancelAnimationFrame(frame.current);frame.current=0;}latest.current.scale(id,current.next);gesture.current=null;setResizing(false);latest.current.resizeEnd();};
  return <div className={`canvas-card-shell ${selected?'card-selected':''} ${resizing?'card-resizing':''}`} data-card-id={id} data-card-scale={scale} style={{width:CARD_WIDTH*scale,height:height*scale}}>
    <div ref={content} className="canvas-card-content" style={{width:CARD_WIDTH,transform:`scale(${scale})`}}>{children}</div><Ports/><CardNoteAction id={id} title={title}/>
    <button className="card-resize-handle nodrag nopan" aria-label={`缩放卡片：${title}`} title={`拖动等比例缩放 · ${Math.round(scale*100)}%`} onClick={event=>event.stopPropagation()} onDoubleClick={event=>{event.stopPropagation();latest.current.resizeStart();latest.current.scale(id,1);latest.current.resizeEnd();}} onKeyDown={event=>{if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key))return;event.preventDefault();event.stopPropagation();latest.current.resizeStart();latest.current.scale(id,scale+(['ArrowRight','ArrowDown'].includes(event.key)?.05:-.05));latest.current.resizeEnd();}} onPointerDown={event=>{if(event.button!==0)return;event.preventDefault();event.stopPropagation();event.currentTarget.setPointerCapture(event.pointerId);gesture.current={pointer:event.pointerId,x:event.clientX,y:event.clientY,scale,height,zoom:getZoom(),next:scale};setResizing(true);latest.current.resizeStart();}} onPointerMove={event=>{const current=gesture.current;if(!current||current.pointer!==event.pointerId)return;event.preventDefault();event.stopPropagation();const dx=(event.clientX-current.x)/current.zoom,dy=(event.clientY-current.y)/current.zoom;current.next=clampCardScale(current.scale+(dx*CARD_WIDTH+dy*current.height)/(CARD_WIDTH*CARD_WIDTH+current.height*current.height));if(!frame.current)frame.current=requestAnimationFrame(()=>{frame.current=0;if(gesture.current)latest.current.scale(id,gesture.current.next);});}} onPointerUp={event=>{if(gesture.current?.pointer===event.pointerId){event.stopPropagation();finish();if(event.currentTarget.hasPointerCapture(event.pointerId))event.currentTarget.releasePointerCapture(event.pointerId);}}} onPointerCancel={finish} onLostPointerCapture={finish}><ArrowDownRight size={12}/></button>
  </div>;
}

export function PaperPreview({variant='sage',title='',large=false}:{variant?:string;title?:string;large?:boolean}){
  return <div className={`paper-preview preview-${variant} ${large?'large-preview':''}`} aria-hidden="true">
    <div className="preview-page"><div className="preview-paper-title">{title}</div><div className="preview-authors">A research paper · ideas worth connecting</div><div className="preview-rule"/><div className="preview-columns"><div><b>Abstract</b>{[93,100,86,96,100,74].map((w,i)=><i key={i} style={{width:w+'%'}}/>)}<b>1. Introduction</b>{[100,94,100,78].map((w,i)=><i key={i} style={{width:w+'%'}}/>)}</div><div>{variant==='sage'?<div className="transformer-figure"><span>Output Probabilities</span><div className="diagram-block peach">Linear & Softmax</div><div className="diagram-arrow">↑</div><div className="diagram-block blue">Multi-Head Attention</div><div className="diagram-arrow">↑</div><div className="diagram-block sage">Positional Encoding</div><div className="diagram-arrow">↑</div><div className="diagram-block peach">Input Embedding</div></div>:<>{[100,90,100,96].map((w,i)=><i key={i} style={{width:w+'%'}}/>)}<div className="mini-chart"><span/><span/><span/><span/><span/></div>{[98,100,82].map((w,i)=><i key={i} style={{width:w+'%'}}/>)}</>}</div></div></div>
  </div>;
}

export const PaperCard=memo(function PaperCard({id,data,selected}:NodeProps<PaperNode>){
  const actions=useContext(NodeActions);
  const {fields,scale}=resolveCardAppearance(data.appearance,actions.cardDefaults);
  const kind=getAssetKind(data),label=ASSET_LABELS[kind],action=kind==='word'?'编辑 Word':kind==='image'?'查看图片':'阅读文件';
  return <CardShell id={id} title={data.title} scale={scale} selected={selected}><article className={`paper-card accent-${data.accent} ${selected?'selected':''}`}>
    <div className="paper-card-main">
      <div className="paper-eyebrow"><span className="pdf-type"><FileText size={12}/> {label}</span>{fields.year&&data.year&&<span className="paper-year">{data.year}</span>}<button className={`star-button nodrag ${data.starred?'is-starred':''}`} title={data.starred?'取消收藏':'收藏文件'} aria-label={data.starred?'取消收藏':'收藏文件'} onClick={e=>{e.stopPropagation();actions.star(id);}}><Star size={14} fill={data.starred?'currentColor':'none'}/></button></div>
      <h3>{data.title}</h3>{fields.authors&&data.authors&&kind!=='image'&&<p className="paper-author">{data.authors}</p>}
      {fields.preview?<button className="preview-button nodrag" onClick={e=>{e.stopPropagation();actions.open(id);}} title="打开文献预览" aria-label={`预览 ${data.title}`}>
        {data.thumbnail?<div className={`imported-thumb ${kind==='image'?'asset-image-thumb':''}`}><img src={data.thumbnail} alt={`${label} 预览`}/></div>:kind==='pdf'?<PaperPreview variant={data.accent} title={data.title}/>:<div className="asset-placeholder"><b>{label}</b><small>{kind==='word'?'在平台内编辑正文':'连续阅读幻灯片'}</small></div>}
        <span className="preview-open"><BookOpen size={13}/> {action} <ArrowUpRight size={12}/></span>
      </button>:<button className="card-open-compact nodrag" aria-label={`预览 ${data.title}`} onClick={e=>{e.stopPropagation();actions.open(id);}}><BookOpen size={12}/>{action}<ArrowUpRight size={11}/></button>}
      {kind==='image'&&fields.dimensions&&data.asset?.width&&<p className="card-file-meta">{data.asset.width} × {data.asset.height} px</p>}
      {fields.remark&&data.remark&&<p className="card-remark">{data.remark}</p>}
      {fields.abstract&&<p className="card-abstract">{data.abstract||'暂无摘要，可在文献信息中补充。'}</p>}
      {fields.tags&&data.tags.length>0&&<div className="paper-tags">{data.tags.map(t=><span key={t}>{t}</span>)}</div>}
    </div>
    {(fields.status||fields.venue)&&<footer className="paper-footer">{fields.status&&<span className={`status status-${data.status}`}><span className="status-dot">{data.status==='read'&&<Check size={8} strokeWidth={3}/>}</span>{STATUS_LABELS[data.status]}</span>}{fields.venue&&<span>{data.venue||`本地${label}`}</span>}</footer>}
  </article></CardShell>;
});

export const TextCard=memo(function TextCard({id,data,selected}:NodeProps<TextNode>){const actions=useContext(NodeActions);const {fields,scale}=resolveCardAppearance(data.appearance,actions.cardDefaults);return <CardShell id={id} title={data.title} scale={scale} selected={selected}><article className={`text-card note-${data.color} ${selected?'selected':''}`} onDoubleClick={()=>actions.edit(id)}><div className="note-heading"><span><StickyNote size={13}/> 灵感笔记</span><MoreHorizontal size={16}/></div><h3>{data.title}</h3>{fields.content&&<div className="note-content" dangerouslySetInnerHTML={{__html:DOMPurify.sanitize(data.html)}}/>}<div className="note-bottom"><Sparkles size={12}/><span>把想法留在这里，让连接发生</span></div></article></CardShell>;});
export const SectionLabel=memo(function SectionLabel({data}:NodeProps<SectionNode>){return <div className="section-label"><span>{data.title}</span><b>{data.subtitle}</b><i/></div>;});
export const nodeTypes={paper:PaperCard,text:TextCard,section:SectionLabel};
