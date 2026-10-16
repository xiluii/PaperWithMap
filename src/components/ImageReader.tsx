import { useEffect,useRef,useState } from 'react';
import { Pencil, MessageSquare, Monitor, ArrowDownToLine,Maximize,Minus,Plus,RotateCcw } from 'lucide-react';
import type { FileReaderProps } from './file-reader-types';
import { useContextMenu } from './ContextMenu';
import { menuSeparator } from '../context-menu';
import { fileUrl, openDefaultFile } from '../backend';
import { clampImagePan,fitImage,zoomImageAt } from '../image-view';
import type { ImageTransform } from '../image-view';
import { Modal } from './Dialogs';
import AssetNotes from './AssetNotes';
import FocusModeButton from './FocusModeButton';
import useFocusMode from '../useFocusMode';

export default function ImageReader(props:FileReaderProps){
  const contextMenu=useContextMenu();
  const {paper,onClose,onUpdate}=props,focus=useFocusMode('reader');
  const viewport=useRef<HTMLDivElement>(null),image=useRef<HTMLImageElement>(null),[view,setView]=useState<ImageTransform>({zoom:1,x:0,y:0});
  const current=useRef(view);current.current=view;
  const drag=useRef<{pointer:number;x:number;y:number;start:ImageTransform}|null>(null),[error,setError]=useState(''),[loaded,setLoaded]=useState(false),[fitted,setFitted]=useState(true);
  const fit=()=>{const root=viewport.current,img=image.current;if(!root||!img?.naturalWidth)return;setFitted(true);setView({zoom:fitImage(img.naturalWidth,img.naturalHeight,root.clientWidth,root.clientHeight),x:0,y:0});};
  const clamp=(value:ImageTransform)=>{const root=viewport.current,img=image.current;return root&&img?clampImagePan(value,img.naturalWidth,img.naturalHeight,root.clientWidth,root.clientHeight):value;};
  const zoom=(value:number,x=0,y=0)=>{setFitted(false);setView(v=>clamp(zoomImageAt(v,value,x,y)));};
  useEffect(()=>{const root=viewport.current;if(!root)return;const observer=new ResizeObserver(()=>{if(fitted)fit();});observer.observe(root);return()=>observer.disconnect();},[fitted,loaded]);
  useEffect(()=>{const root=viewport.current;if(!root)return;const wheel=(event:WheelEvent)=>{event.preventDefault();const rect=root.getBoundingClientRect();zoom(current.current.zoom*Math.exp(-event.deltaY*.0015),event.clientX-rect.left-rect.width/2,event.clientY-rect.top-rect.height/2);};root.addEventListener('wheel',wheel,{passive:false});return()=>root.removeEventListener('wheel',wheel);},[]);
  return <Modal title={paper.title} onClose={onClose} className={`paper-reader-modal asset-reader-modal ${focus.focused?'reader-focused':''}`} onKeyDown={focus.onKeyDown} headingActions={<FocusModeButton focused={focus.focused} onToggle={focus.toggle} label="专注看图"/>}><div className="asset-reader-body"><div className="asset-command-bar"><label className="asset-title-edit">图片名称<input aria-label="图片名称" value={paper.title} maxLength={300} onChange={e=>onUpdate({title:e.target.value})}/></label><span className="asset-dimensions">{paper.asset?.width} × {paper.asset?.height} px</span><div className="image-zoom-controls"><button className="icon-button" aria-label="缩小图片" onClick={()=>zoom(view.zoom/1.25)}><Minus size={16}/></button><span>{Math.round(view.zoom*100)}%</span><button className="icon-button" aria-label="放大图片" onClick={()=>zoom(view.zoom*1.25)}><Plus size={16}/></button><button className="secondary-button" title="原始尺寸" onClick={()=>{setFitted(false);setView({zoom:1,x:0,y:0});}}>100%</button><button className="icon-button" aria-label="图片适应窗口" title="适应窗口" onClick={fit}><Maximize size={16}/></button><button className="icon-button" aria-label="重置图片视图" title="重置视图" onClick={fit}><RotateCcw size={15}/></button><a className="icon-button" href={fileUrl(paper.fileId!,true)} download={paper.fileName} title="下载原图" aria-label="下载原图"><ArrowDownToLine size={16}/></a></div></div>
    <AssetNotes reader={props}><div className="image-workspace"><div ref={viewport} onContextMenu={event=>contextMenu.open(event,'图片操作',[
      {id:'fit',label:'图片适应窗口',icon:Maximize,onSelect:fit},
      {id:'actual',label:'原始尺寸 · 100%',onSelect:()=>{setFitted(false);setView({zoom:1,x:0,y:0});}},
      {id:'zoom-in',label:'放大图片',icon:Plus,onSelect:()=>zoom(current.current.zoom*1.25)},
      {id:'zoom-out',label:'缩小图片',icon:Minus,onSelect:()=>zoom(current.current.zoom/1.25)},menuSeparator,
      {id:'rename',label:'修改图片名称',icon:Pencil,onSelect:()=>{const input=viewport.current?.closest('.modal')?.querySelector<HTMLInputElement>('input[aria-label="图片名称"]');input?.focus();input?.select();}},
      {id:'remark',label:'编辑图片备注',icon:MessageSquare,onSelect:()=>viewport.current?.closest('.modal')?.querySelector<HTMLTextAreaElement>('textarea[aria-label="图片备注"]')?.focus()},
      {id:'external',label:'用默认软件打开',icon:Monitor,onSelect:async()=>{await openDefaultFile(paper.fileId!);}},
      {id:'download',label:'下载原图',icon:ArrowDownToLine,href:fileUrl(paper.fileId!,true),download:paper.fileName},
    ])} className={`image-viewport ${drag.current?'dragging':''}`} onDoubleClick={fit} onPointerDown={event=>{if(event.button!==0)return;event.currentTarget.setPointerCapture(event.pointerId);drag.current={pointer:event.pointerId,x:event.clientX,y:event.clientY,start:current.current};event.currentTarget.classList.add('dragging');}} onPointerMove={event=>{const gesture=drag.current;if(gesture?.pointer!==event.pointerId)return;setFitted(false);setView(clamp({...gesture.start,x:gesture.start.x+event.clientX-gesture.x,y:gesture.start.y+event.clientY-gesture.y}));}} onPointerUp={event=>{drag.current=null;event.currentTarget.classList.remove('dragging');if(event.currentTarget.hasPointerCapture(event.pointerId))event.currentTarget.releasePointerCapture(event.pointerId);}} onPointerCancel={event=>{drag.current=null;event.currentTarget.classList.remove('dragging');}} onLostPointerCapture={event=>{drag.current=null;event.currentTarget.classList.remove('dragging');}}><img ref={image} src={fileUrl(paper.fileId!,true)} alt={paper.title} draggable={false} style={{transform:`translate(${view.x}px,${view.y}px) scale(${view.zoom})`}} onLoad={()=>{setLoaded(true);fit();}} onError={()=>setError('图片加载失败，请检查本地原文件是否仍存在')}/>{error&&<p className="image-error" role="alert">{error}</p>}<span className="image-view-hint">滚轮缩放 · 拖动平移 · 双击适应窗口</span></div><label className="image-remark">备注<textarea aria-label="图片备注" placeholder="记录图片的来源、内容或想法…" value={paper.remark||''} onChange={e=>onUpdate({remark:e.target.value})}/><small>{props.saveState==='saving'?'正在保存…':props.saveState==='error'?'保存失败，请保持页面打开':'备注已自动保存'}</small></label></div></AssetNotes></div></Modal>;
}
