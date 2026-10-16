import { useEffect, useRef, useState } from 'react';
import type { CSSProperties, RefObject } from 'react';
import { ChevronLeft, ChevronRight, GripVertical } from 'lucide-react';

function splitBounds(width:number){
  return {min:Math.max(25,Math.min(45,320/width*100)),max:Math.min(65,Math.max(45,100-352/width*100))};
}
function saveSplit(scope:string,size:number){
  try{localStorage.setItem(`paperly:${scope}-split`,String(size));}catch{/* Resizing remains available without storage. */}
}

export function useNoteSplit(scope:'board'|'reader',initial=40){
  const container=useRef<HTMLDivElement>(null);
  const [size,setSize]=useState(()=>{try{const value=Number(localStorage.getItem(`paperly:${scope}-split`));return value>=25&&value<=65?value:initial;}catch{return initial;}});
  const latest=useRef(size);latest.current=size;
  useEffect(()=>{const timer=setTimeout(()=>saveSplit(scope,size),200);return()=>clearTimeout(timer);},[scope,size]);
  useEffect(()=>{const flush=()=>saveSplit(scope,latest.current);window.addEventListener('pagehide',flush);return()=>{window.removeEventListener('pagehide',flush);flush();};},[scope]);
  return {container,size,setSize,style:{'--note-pane-size':`${size}%`} as CSSProperties};
}

export default function SplitDivider({container,size,onChange}:{container:RefObject<HTMLDivElement|null>;size:number;onChange:(value:number)=>void}){
  const frame=useRef(0),pending=useRef<number|null>(null),pointer=useRef<number|null>(null);
  const bounds=()=>splitBounds(container.current?.clientWidth||1000);
  const [limits,setLimits]=useState({min:25,max:65});
  useEffect(()=>{const root=container.current;if(!root)return;const measure=()=>{const next=splitBounds(root.clientWidth||1000);setLimits(previous=>previous.min===next.min&&previous.max===next.max?previous:next);};const observer=new ResizeObserver(measure);observer.observe(root);measure();return()=>observer.disconnect();},[container]);
  const effectiveSize=Math.min(limits.max,Math.max(limits.min,size));
  const change=(value:number)=>{const {min,max}=bounds();onChange(Math.min(max,Math.max(min,value)));};
  const flush=()=>{cancelAnimationFrame(frame.current);frame.current=0;if(pending.current!==null){change(pending.current);pending.current=null;}};
  useEffect(()=>()=>cancelAnimationFrame(frame.current),[]);
  return <div className="split-divider"><div className="split-divider-controls">
    <button aria-label="缩小笔记区域" title="缩小笔记区域" disabled={effectiveSize<=limits.min+.01} onClick={()=>change(effectiveSize-5)}><ChevronRight size={14}/></button>
    <div className="split-divider-grip" role="separator" aria-label="调整笔记分屏比例" aria-orientation="vertical"
      aria-valuemin={Math.round(limits.min)} aria-valuemax={Math.round(limits.max)} aria-valuenow={Math.round(effectiveSize)} aria-valuetext={`笔记占 ${Math.round(effectiveSize)}%`} tabIndex={0}
      title="拖动调整分屏 · 左右方向键调整 · 双击还原"
      onDoubleClick={()=>change(40)} onKeyDown={event=>{
        const value=event.key==='ArrowLeft'?effectiveSize+2:event.key==='ArrowRight'?effectiveSize-2:event.key==='Home'?bounds().min:event.key==='End'?bounds().max:event.key==='Enter'?40:null;
        if(value===null)return;event.preventDefault();event.stopPropagation();change(value);
      }} onPointerDown={event=>{if(event.button!==0)return;event.preventDefault();pointer.current=event.pointerId;event.currentTarget.setPointerCapture(event.pointerId);event.currentTarget.focus();}}
      onPointerMove={event=>{if(pointer.current!==event.pointerId)return;const rect=container.current?.getBoundingClientRect();if(!rect)return;pending.current=(rect.right-event.clientX)/rect.width*100;if(!frame.current)frame.current=requestAnimationFrame(flush);}}
      onPointerUp={event=>{if(pointer.current!==event.pointerId)return;flush();pointer.current=null;if(event.currentTarget.hasPointerCapture(event.pointerId))event.currentTarget.releasePointerCapture(event.pointerId);}}
      onPointerCancel={()=>{flush();pointer.current=null;}} onLostPointerCapture={()=>{flush();pointer.current=null;}}><GripVertical size={15}/></div>
    <button aria-label="扩大笔记区域" title="扩大笔记区域" disabled={effectiveSize>=limits.max-.01} onClick={()=>change(effectiveSize+5)}><ChevronLeft size={14}/></button>
  </div></div>;
}
