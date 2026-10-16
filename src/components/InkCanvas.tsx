import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import type { InkPoint, InkStroke } from '../types';
import { drawStroke, inkBounds, pressureValue, strokeBounds, strokeHit, toInkPoint } from '../ink-model';
import { uid } from '../model';

export type InkTool = 'pen' | 'highlighter' | 'eraser' | 'hand';
export type InkCanvasHandle = { zoomBy: (factor:number)=>void; fit:()=>void; reset:()=>void; finish:()=>void };
type Props = {
  strokes: InkStroke[]; tool: InkTool; color: string; width: number; pressure: boolean; penOnly: boolean;
  onChange: (strokes:InkStroke[])=>void; onZoom:(zoom:number)=>void; onInput:(type:string,pressure:number)=>void;
  fixedViewport?: {x:number;y:number;zoom:number}; ariaLabel?:string;
};
type Gesture = {id:number;kind:'draw';stroke:InkStroke}|{id:number;kind:'erase';removed:Set<string>;last:InkPoint}|{id:number;kind:'pan';x:number;y:number;startX:number;startY:number};

const InkCanvas=forwardRef<InkCanvasHandle,Props>(function InkCanvas(props,ref){
  const surface=useRef<HTMLDivElement>(null),base=useRef<HTMLCanvasElement>(null),live=useRef<HTMLCanvasElement>(null);
  const runtime=useRef(props);runtime.current=props;
  const strokes=useRef(props.strokes);
  const boundsCache=useRef(new Map<string,ReturnType<typeof strokeBounds>>());
  const size=useRef({width:800,height:600,ratio:1});
  const viewport=useRef({x:0,y:0,zoom:1});
  const gesture=useRef<Gesture|null>(null);
  const frame=useRef(0),spaceHeld=useRef(false),lastPen=useRef(0);

  const clear=(canvas:HTMLCanvasElement|null)=>{const context=canvas?.getContext('2d');if(canvas&&context){context.setTransform(1,0,0,1,0,0);context.clearRect(0,0,canvas.width,canvas.height);}return context;};
  const transform=(context:CanvasRenderingContext2D)=>{const v=viewport.current,dpr=size.current.ratio;context.setTransform(v.zoom*dpr,0,0,v.zoom*dpr,v.x*dpr,v.y*dpr);};
  const renderBase=()=>{const context=clear(base.current);if(!context)return;transform(context);const current=gesture.current;for(const stroke of strokes.current)if(current?.kind!=='erase'||!current.removed.has(stroke.id))drawStroke(context,stroke);};
  const renderLive=()=>{const context=clear(live.current);if(!context)return;transform(context);const current=gesture.current;if(current?.kind==='draw')drawStroke(context,current.stroke,false);};
  const requestRender=(background=false)=>{if(frame.current)cancelAnimationFrame(frame.current);frame.current=requestAnimationFrame(()=>{frame.current=0;if(background)renderBase();renderLive();});};
  const finish=()=>{
    const current=gesture.current;if(!current)return;gesture.current=null;
    if(current.kind==='draw'){
      const next=[...strokes.current,current.stroke];strokes.current=next;const context=base.current?.getContext('2d');if(context){context.save();transform(context);drawStroke(context,current.stroke);context.restore();}clear(live.current);runtime.current.onChange(next);
    }else if(current.kind==='erase'){
      const next=strokes.current.filter(stroke=>!current.removed.has(stroke.id));const changed=next.length!==strokes.current.length;strokes.current=next;renderBase();if(changed)runtime.current.onChange(next);
    }else runtime.current.onZoom(viewport.current.zoom);
    if(frame.current){cancelAnimationFrame(frame.current);frame.current=0;}
    surface.current?.classList.remove('ink-is-drawing','ink-is-panning');
  };
  const fit=()=>{finish();const bounds=inkBounds(strokes.current),s=size.current;const availableHeight=Math.max(100,s.height-170);const zoom=strokes.current.length?Math.min(2,Math.max(.15,Math.min((s.width-75)/(bounds.width+30),availableHeight/(bounds.height+30)))):1;viewport.current={x:(s.width-bounds.width*zoom)/2-bounds.x*zoom,y:18+(availableHeight-bounds.height*zoom)/2-bounds.y*zoom,zoom};renderBase();renderLive();runtime.current.onZoom(zoom);};
  const zoomAt=(factor:number,x=size.current.width/2,y=size.current.height/2)=>{finish();const v=viewport.current;const zoom=Math.min(4,Math.max(.15,v.zoom*factor));viewport.current={x:x-(x-v.x)*zoom/v.zoom,y:y-(y-v.y)*zoom/v.zoom,zoom};renderBase();renderLive();runtime.current.onZoom(zoom);};
  useImperativeHandle(ref,()=>({zoomBy:zoomAt,fit,reset:()=>zoomAt(1/viewport.current.zoom),finish}));

  useEffect(()=>{if(strokes.current!==props.strokes){strokes.current=props.strokes;renderBase();renderLive();}},[props.strokes]);
  useEffect(()=>{if(props.fixedViewport){finish();viewport.current=props.fixedViewport;renderBase();renderLive();}},[props.fixedViewport?.x,props.fixedViewport?.y,props.fixedViewport?.zoom]);
  useEffect(()=>{
    const target=surface.current;if(!target)return;
    let first=true;
    const resize=()=>{const rect=target.getBoundingClientRect();const ratio=Math.min(window.devicePixelRatio||1,2);size.current={width:rect.width,height:rect.height,ratio};for(const canvas of [base.current,live.current])if(canvas){canvas.width=Math.round(rect.width*ratio);canvas.height=Math.round(rect.height*ratio);}if(runtime.current.fixedViewport)viewport.current=runtime.current.fixedViewport;else if(first){if(strokes.current.length)fit();else viewport.current={x:0,y:0,zoom:1};}first=false;renderBase();renderLive();};
    const observer=new ResizeObserver(resize);observer.observe(target);resize();
    const point=(event:PointerEvent)=>{const rect=target.getBoundingClientRect();return toInkPoint(event.clientX-rect.left,event.clientY-rect.top,pressureValue(event.pressure,event.pointerType),viewport.current);};
    const eraseAt=(p:InkPoint,current:Extract<Gesture,{kind:'erase'}>)=>{const radius=16/viewport.current.zoom;const count=Math.max(1,Math.ceil(Math.hypot(p.x-current.last.x,p.y-current.last.y)/(radius*.75)));for(let i=1;i<=Math.min(count,160);i++){const t=i/Math.min(count,160),sample={x:current.last.x+(p.x-current.last.x)*t,y:current.last.y+(p.y-current.last.y)*t,pressure:.5};for(const stroke of strokes.current){let bounds=boundsCache.current.get(stroke.id);if(!bounds){bounds=strokeBounds(stroke);boundsCache.current.set(stroke.id,bounds);}if(!current.removed.has(stroke.id)&&strokeHit(stroke,sample,radius,bounds))current.removed.add(stroke.id);}}current.last=p;};
    const down=(event:PointerEvent)=>{
      if(gesture.current||event.button===2)return;
      const settings=runtime.current;
      const pan=settings.tool==='hand'||spaceHeld.current||event.button===1;
      if(settings.fixedViewport&&pan)return;
      if(!pan&&((settings.penOnly&&event.pointerType!=='pen')||(event.pointerType==='touch'&&performance.now()-lastPen.current<700)))return;
      event.preventDefault();target.focus({preventScroll:true});target.setPointerCapture(event.pointerId);
      if(event.pointerType==='pen')lastPen.current=performance.now();
      if(pan){gesture.current={id:event.pointerId,kind:'pan',x:event.clientX,y:event.clientY,startX:viewport.current.x,startY:viewport.current.y};target.classList.add('ink-is-panning');return;}
      runtime.current.onInput(event.pointerType,pressureValue(event.pressure,event.pointerType));
      const p=point(event);
      if(settings.tool==='eraser'||event.button===5||(event.buttons&32)!==0){const current:Extract<Gesture,{kind:'erase'}>={id:event.pointerId,kind:'erase',removed:new Set(),last:p};gesture.current=current;eraseAt(p,current);requestRender(true);}
      else{gesture.current={id:event.pointerId,kind:'draw',stroke:{id:uid(),points:[p],color:settings.color,width:settings.tool==='highlighter'?settings.width*5:settings.width,tool:settings.tool==='highlighter'?'highlighter':'pen',pressure:settings.pressure,simulatePressure:event.pointerType!=='pen'}};requestRender();}
      target.classList.add('ink-is-drawing');
    };
    const move=(event:PointerEvent)=>{
      const current=gesture.current;if(!current||current.id!==event.pointerId)return;event.preventDefault();
      if(event.pointerType==='pen')lastPen.current=performance.now();
      if(current.kind==='pan'){viewport.current={...viewport.current,x:current.startX+event.clientX-current.x,y:current.startY+event.clientY-current.y};requestRender(true);return;}
      const coalesced=event.getCoalescedEvents?.()||[];const samples=coalesced.length?coalesced:[event];
      for(const sample of samples){const p=point(sample);if(current.kind==='erase')eraseAt(p,current);else{const previous=current.stroke.points[current.stroke.points.length-1];if(Math.hypot(p.x-previous.x,p.y-previous.y)>.025||Math.abs(p.pressure-previous.pressure)>.01)current.stroke.points.push(p);}}
      requestRender(current.kind==='erase');
    };
    const up=(event:PointerEvent)=>{if(gesture.current?.id!==event.pointerId)return;if(event.type==='pointerup'&&gesture.current.kind==='draw')gesture.current.stroke.points.push(point(event));finish();if(target.hasPointerCapture(event.pointerId))target.releasePointerCapture(event.pointerId);};
    const wheel=(event:WheelEvent)=>{if(runtime.current.fixedViewport)return;event.preventDefault();if(gesture.current)return;if(event.ctrlKey||event.metaKey){const rect=target.getBoundingClientRect();zoomAt(Math.exp(-event.deltaY*.005),event.clientX-rect.left,event.clientY-rect.top);}else{viewport.current={...viewport.current,x:viewport.current.x-event.deltaX,y:viewport.current.y-event.deltaY};requestRender(true);}};
    const keyDown=(event:KeyboardEvent)=>{if(event.code==='Space'&&target.contains(document.activeElement)){event.preventDefault();spaceHeld.current=true;target.classList.add('ink-space-held');}};
    const keyUp=(event:KeyboardEvent)=>{if(event.code==='Space'){spaceHeld.current=false;target.classList.remove('ink-space-held');}};
    const blur=()=>{spaceHeld.current=false;target.classList.remove('ink-space-held');finish();};
    target.addEventListener('pointerdown',down);target.addEventListener('pointermove',move);target.addEventListener('pointerup',up);target.addEventListener('pointercancel',up);target.addEventListener('lostpointercapture',up);target.addEventListener('wheel',wheel,{passive:false});window.addEventListener('keydown',keyDown);window.addEventListener('keyup',keyUp);window.addEventListener('blur',blur);
    return()=>{observer.disconnect();if(frame.current)cancelAnimationFrame(frame.current);target.removeEventListener('pointerdown',down);target.removeEventListener('pointermove',move);target.removeEventListener('pointerup',up);target.removeEventListener('pointercancel',up);target.removeEventListener('lostpointercapture',up);target.removeEventListener('wheel',wheel);window.removeEventListener('keydown',keyDown);window.removeEventListener('keyup',keyUp);window.removeEventListener('blur',blur);};
  },[]);

  return <div ref={surface} className={`ink-surface ink-tool-${props.tool}`} role="application" aria-label={props.ariaLabel||'手写画布'} tabIndex={0} onContextMenu={event=>event.preventDefault()}><canvas ref={base} className="ink-layer" aria-label={`已保存的手写笔画，共 ${props.strokes.length} 笔`}/><canvas ref={live} className="ink-layer ink-live-layer" aria-hidden="true"/></div>;
});
export default InkCanvas;
