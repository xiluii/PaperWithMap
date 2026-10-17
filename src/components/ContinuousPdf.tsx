import { memo, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { PDFDocumentProxy, PDFPageProxy, RenderTask } from 'pdfjs-dist';
import { TextLayer } from 'pdfjs-dist';
import { Copy, Languages, FileWarning, LoaderCircle, Minus, Plus, Scan } from 'lucide-react';
import { useContextMenu } from './ContextMenu';
import { useReadingTranslation } from './ReadingTranslation';
import { menuSeparator, nativeContextTarget } from '../context-menu';
import type { ContextMenuItem } from '../context-menu';
import type { PdfPageInk } from '../types';
import { anchoredScrollTop, pageIndexAtOffset, pdfPageScale } from '../pdf-scroll';
import '../pdf-reader.css';

export type PdfPageView={pageNumber:number;geometry:Omit<PdfPageInk,'strokes'>;scale:number};
type PageRecord={pageNumber:number;page:PDFPageProxy|null;geometry:PdfPageView['geometry'];error?:string};
type Props={url:string;banner?:ReactNode;renderOverlay?:(page:PdfPageView)=>ReactNode;renderFooter?:(page:number,total:number)=>ReactNode;contextItems?:ContextMenuItem[]};

async function documentPages(pdf:PDFDocumentProxy,live:()=>boolean):Promise<PageRecord[]>{
  const first=await pdf.getPage(1),firstView=first.getViewport({scale:1});
  const fallback={width:firstView.width,height:firstView.height,transform:[...firstView.transform]};
  const pages=new Array<PageRecord>(pdf.numPages);let next=1;
  await Promise.all(Array.from({length:Math.min(4,pdf.numPages)},async()=>{
    while(live()&&next<=pdf.numPages){const pageNumber=next++;try{const page=pageNumber===1?first:await pdf.getPage(pageNumber),viewport=page.getViewport({scale:1});pages[pageNumber-1]={pageNumber,page,geometry:{width:viewport.width,height:viewport.height,transform:[...viewport.transform]}};}catch{pages[pageNumber-1]={pageNumber,page:null,geometry:fallback,error:`第 ${pageNumber} 页无法读取，可继续阅读其他页面。`};}}
  }));return pages;
}

export default function ContinuousPdf({url,banner,renderOverlay,renderFooter,contextItems=[]}:Props){
  const contextMenu=useContextMenu(),translation=useReadingTranslation();
  const [pages,setPages]=useState<PageRecord[]>([]),[error,setError]=useState(''),[zoom,setZoom]=useState(1),[available,setAvailable]=useState(800),[activePage,setActivePage]=useState(1);
  const [root,setRoot]=useState<HTMLDivElement|null>(null),[near,setNear]=useState<Set<number>>(()=>new Set([1])),[pinned,setPinned]=useState<{page:number;pointer:number}|null>(null);
  const stack=useRef<HTMLDivElement>(null),elements=useRef(new Map<number,HTMLElement>()),frame=useRef(0);
  const layout=useRef<{tops:number[];heights:number[];scrollTop:number}>({tops:[],heights:[],scrollTop:0});
  useEffect(()=>{let live=true;let doc:PDFDocumentProxy|undefined;setPages([]);setError('');setActivePage(1);setNear(new Set([1]));setPinned(null);layout.current={tops:[],heights:[],scrollTop:0};
    import('../pdf').then(({openPdf})=>openPdf(url)).then(async value=>{doc=value;if(!live){await value.destroy();return;}const records=await documentPages(value,()=>live);if(live)setPages(records);}).catch(e=>{if(live)setError(e.message||'无法读取 PDF，请检查本地文件。');});
    return()=>{live=false;if(doc)void doc.destroy();};
  },[url]);
  const updateActive=useCallback(()=>{if(!root||!root.clientWidth||!root.clientHeight)return;const atEnd=root.scrollTop>0&&root.scrollHeight-root.clientHeight-root.scrollTop<2;setActivePage(atEnd?pages.length||1:Math.min(pages.length||1,pageIndexAtOffset(layout.current.tops,root.scrollTop+root.clientHeight*.3)+1));},[root,pages.length]);
  useEffect(()=>{if(!root)return;const measure=()=>{if(!root.clientWidth||!root.clientHeight)return;setAvailable(root.clientWidth);updateActive();};const observer=new ResizeObserver(measure);observer.observe(root);measure();return()=>observer.disconnect();},[root,updateActive]);
  useLayoutEffect(()=>{if(!root||!root.clientWidth||!root.clientHeight||!stack.current||!pages.length)return;const offset=stack.current.offsetTop,tops=pages.map(p=>offset+(elements.current.get(p.pageNumber)?.offsetTop||0)),heights=pages.map(p=>elements.current.get(p.pageNumber)?.offsetHeight||1);root.scrollTop=anchoredScrollTop(layout.current,tops,heights);layout.current={tops,heights,scrollTop:root.scrollTop};updateActive();},[root,pages,zoom,available,updateActive]);
  useEffect(()=>{if(!root||!pages.length)return;const observer=new IntersectionObserver(entries=>{setNear(previous=>{const next=new Set(previous);for(const entry of entries){const number=Number((entry.target as HTMLElement).dataset.pdfPage);if(entry.isIntersecting)next.add(number);else next.delete(number);}return next.size===previous.size&&[...next].every(n=>previous.has(n))?previous:next;});},{root,rootMargin:'900px 600px',threshold:0});for(const element of elements.current.values())observer.observe(element);return()=>observer.disconnect();},[root,pages]);
  useEffect(()=>()=>{if(frame.current)cancelAnimationFrame(frame.current);},[]);
  useEffect(()=>{root?.dispatchEvent(new CustomEvent('paperly:pdf-page',{bubbles:true}));},[root,activePage]);
  const scroll=()=>{if(!root||!root.clientWidth||!root.clientHeight)return;layout.current.scrollTop=root.scrollTop;if(!frame.current)frame.current=requestAnimationFrame(()=>{frame.current=0;updateActive();});};
  const openMenu=(event:React.MouseEvent)=>{
    if(nativeContextTarget(event.target as Element))return;
    const selected=window.getSelection(),range=selected?.rangeCount?selected.getRangeAt(0):null;
    const text=selected&&!selected.isCollapsed&&range&&root?.contains(range.startContainer)&&root.contains(range.endContainer)?selected.toString().trim():'';
    const items:ContextMenuItem[]=[];
    if(text){
      items.push({id:'copy-selection',label:'复制选中文字',icon:Copy,shortcut:'Ctrl+C',onSelect:async()=>{try{await navigator.clipboard.writeText(text);}catch{throw new Error('无法访问剪贴板，请选中文字后按 Ctrl+C 复制');}}});
      const modal=root?.closest('.paper-reader-modal'),rect=range!.getBoundingClientRect();
      const start=range!.startContainer instanceof Element?range!.startContainer:range!.startContainer.parentElement;
      const page=Number(start?.closest('[data-pdf-page]')?.getAttribute('data-pdf-page'))||undefined;
      if(translation?.enabled&&modal)items.push({id:'translate',label:'查询选中词语',icon:Languages,onSelect:()=>translation.translateSelection({text,rect,root:modal,page})});
      items.push(menuSeparator);
    }
    items.push({id:'zoom-in',label:'放大页面',icon:Plus,disabled:zoom>=3,onSelect:()=>setZoom(z=>Math.min(3,z*1.2))},
      {id:'zoom-out',label:'缩小页面',icon:Minus,disabled:zoom<=.5,onSelect:()=>setZoom(z=>Math.max(.5,z/1.2))},
      {id:'fit',label:'页面适合宽度',icon:Scan,onSelect:()=>setZoom(1)});
    if(translation)items.push({id:'translation',label:'划词翻译',icon:Languages,checked:translation.enabled,onSelect:translation.toggle});
    if(contextItems.length)items.push(menuSeparator,...contextItems);
    contextMenu.open(event,text?'原文选区':'文献阅读',items);
  };
  return <section className="continuous-pdf" aria-label="PDF 连续阅读"><div className="pdf-navigation"><div className="pdf-reading-progress"><span>连续阅读</span><i/><span aria-live="polite">第 {activePage} 页 <i>/ {pages.length||'—'} 页</i></span></div><div><button className="icon-button" title="缩小 PDF" aria-label="缩小 PDF" disabled={zoom<=.5} onClick={()=>setZoom(z=>Math.max(.5,z/1.2))}><Minus size={15}/></button><span className="pdf-zoom-label">{Math.round(zoom*100)}%</span><button className="icon-button" title="放大 PDF" aria-label="放大 PDF" disabled={zoom>=3} onClick={()=>setZoom(z=>Math.min(3,z*1.2))}><Plus size={15}/></button><button className="icon-button" title="PDF 适合宽度" aria-label="PDF 适合宽度" onClick={()=>setZoom(1)}><Scan size={15}/></button></div></div>{banner}
    <div ref={setRoot} className="pdf-scroll-area pdf-continuous-scroll" data-active-page={activePage} onContextMenu={openMenu} role="region" aria-label="PDF 连续阅读区域" tabIndex={0} onScroll={scroll}>{error?<div className="reader-error" role="alert"><FileWarning size={23}/><p>{error}</p></div>:!pages.length?<div className="reader-loading"><LoaderCircle className="spin" size={18}/>正在加载 PDF 全文…</div>:<><div ref={stack} className="pdf-document-stack">{pages.map(record=>{const scale=pdfPageScale(record.geometry.width,available,zoom),mounted=near.has(record.pageNumber)||pinned?.page===record.pageNumber||activePage===record.pageNumber;return <article key={record.pageNumber} ref={element=>{if(element)elements.current.set(record.pageNumber,element);else elements.current.delete(record.pageNumber);}} className="pdf-document-page" data-pdf-page={record.pageNumber} aria-label={`PDF 第 ${record.pageNumber} 页`} style={{width:record.geometry.width*scale}} onPointerDownCapture={event=>{if(renderOverlay)setPinned({page:record.pageNumber,pointer:event.pointerId});}} onPointerUpCapture={event=>{if(pinned?.pointer===event.pointerId)setPinned(null);}} onPointerCancelCapture={()=>setPinned(null)} onLostPointerCapture={()=>setPinned(null)}><div className="pdf-page-caption">第 {record.pageNumber} 页 <span>/ {pages.length}</span></div><div className="pdf-page-frame" style={{width:record.geometry.width*scale,height:record.geometry.height*scale}}>{record.error?<div className="reader-error">{record.error}</div>:mounted?<><PdfPageCanvas page={record.page!} pageNumber={record.pageNumber} scale={scale}/>{renderOverlay?.({pageNumber:record.pageNumber,geometry:record.geometry,scale})}</>:<div className="pdf-page-placeholder" aria-label={`第 ${record.pageNumber} 页待显示`}>第 {record.pageNumber} 页</div>}</div></article>;})}</div><div className="pdf-document-end">已到文章末尾 <i/> 共 {pages.length} 页</div></>}</div>
    <footer className="pdf-page-status">{renderFooter?renderFooter(activePage,pages.length):<><span>滚动连续阅读</span><span>共 {pages.length||'—'} 页</span></>}</footer>
  </section>;
}

const PdfPageCanvas=memo(function PdfPageCanvas({page,pageNumber,scale}:{page:PDFPageProxy;pageNumber:number;scale:number}){
  const canvas=useRef<HTMLCanvasElement>(null),text=useRef<HTMLDivElement>(null),queue=useRef<Promise<unknown>>(Promise.resolve());
  const [loading,setLoading]=useState(true),[error,setError]=useState('');
  useEffect(()=>{let live=true;let layer:TextLayer|undefined;const element=text.current;if(!element)return;const viewport=page.getViewport({scale});element.style.setProperty('--total-scale-factor',String(scale));element.style.setProperty('--scale-factor',String(scale));element.replaceChildren();void page.getTextContent().then(async content=>{if(!live)return;layer=new TextLayer({textContentSource:content,container:element,viewport});await layer.render();}).catch(()=>{});return()=>{live=false;layer?.cancel();element.replaceChildren();};},[page,scale]);
  useEffect(()=>{let live=true;let task:RenderTask|undefined;setLoading(true);setError('');
    // Wait for cancellation before reusing a canvas during fast zoom changes.
    const next=queue.current.catch(()=>{}).then(async()=>{const target=canvas.current;if(!live||!target)return;const viewport=page.getViewport({scale}),ratio=Math.min(devicePixelRatio||1,2);target.width=Math.ceil(viewport.width*ratio);target.height=Math.ceil(viewport.height*ratio);target.style.width=viewport.width+'px';target.style.height=viewport.height+'px';task=page.render({canvas:target,viewport,transform:[ratio,0,0,ratio,0,0]});await task.promise;if(live)setLoading(false);}).catch(e=>{if(live&&e.name!=='RenderingCancelledException'){setError('此页无法渲染，可继续阅读其他页面。');setLoading(false);}});
    queue.current=next;return()=>{live=false;task?.cancel();};
  },[page,scale]);
  return <><canvas ref={canvas} className="pdf-document-canvas" data-rendered={!loading&&!error} aria-label={`论文第 ${pageNumber} 页`} style={{opacity:loading?.3:1}}/><div ref={text} className="textLayer pdf-selectable-text" aria-label={`第 ${pageNumber} 页可选择文字`}/>{loading&&<div className="pdf-page-render-status"><LoaderCircle size={15} className="spin"/>正在渲染第 {pageNumber} 页…</div>}{error&&<div className="pdf-page-render-error" role="alert">{error}</div>}</>;
});
