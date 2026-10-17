import { useRef, useState } from 'react';
import { canvasImage } from '../reading-context';
import type { ReadingSelection } from '../reading-context';
import { selectionCrop } from '../reading-evidence';

export default function PdfRegionSelector({page,onSelect,onError}:{page:number;onSelect:(selection:ReadingSelection)=>void;onError:(message:string)=>void}){
  const start=useRef<{id:number;x:number;y:number}|null>(null),[box,setBox]=useState<{x:number;y:number;width:number;height:number}|null>(null);
  return <div className="pdf-region-selector" aria-label={`框选第 ${page} 页提问`} onPointerDown={event=>{
    if(event.button!==0)return;event.preventDefault();event.stopPropagation();const r=event.currentTarget.getBoundingClientRect();start.current={id:event.pointerId,x:event.clientX-r.left,y:event.clientY-r.top};event.currentTarget.setPointerCapture(event.pointerId);setBox(null);
  }} onPointerMove={event=>{
    const first=start.current;if(first?.id!==event.pointerId)return;const r=event.currentTarget.getBoundingClientRect(),x=Math.max(0,Math.min(r.width,event.clientX-r.left)),y=Math.max(0,Math.min(r.height,event.clientY-r.top));setBox({x:Math.min(x,first.x),y:Math.min(y,first.y),width:Math.abs(x-first.x),height:Math.abs(y-first.y)});
  }} onPointerUp={event=>{
    const first=start.current;if(first?.id!==event.pointerId)return;start.current=null;setBox(null);
    const r=event.currentTarget.getBoundingClientRect(),x=Math.max(0,Math.min(r.width,event.clientX-r.left)),y=Math.max(0,Math.min(r.height,event.clientY-r.top)),rect={left:r.left+Math.min(x,first.x),top:r.top+Math.min(y,first.y),width:Math.abs(x-first.x),height:Math.abs(y-first.y)};
    if(event.currentTarget.hasPointerCapture(event.pointerId))event.currentTarget.releasePointerCapture(event.pointerId);
    if(rect.width<8||rect.height<8)return;
    try{const canvas=event.currentTarget.parentElement?.querySelector<HTMLCanvasElement>('.pdf-document-canvas');if(!canvas?.width||canvas.dataset.rendered!=='true')throw new Error(`第 ${page} 页仍在渲染，请稍后框选`);onSelect({page,text:`请分析第 ${page} 页框选区域。以附带截图中的公式、图形或文字为准。`,x:rect.left,y:rect.top,image:canvasImage(canvas,canvas.width,canvas.height,selectionCrop(r,rect,canvas.width,canvas.height))});}catch(error){onError((error as Error).message);}
  }} onPointerCancel={()=>{start.current=null;setBox(null);}} onLostPointerCapture={()=>{start.current=null;setBox(null);}}><span className="pdf-region-hint">拖动框选公式、图表或文字，松开后向 AI 提问</span>{box&&<span className="pdf-region-box" style={{left:box.x,top:box.y,width:box.width,height:box.height}}/>}</div>;
}
