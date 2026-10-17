import { useEffect, useState } from 'react';
import type { ReadingContext } from './ai-types';
import type { PaperData } from './types';
import { getAssetKind } from './asset-model';
import { fileUrl, pdfBaseUrl } from './backend';
import { selectionCrop } from './reading-evidence';

export type ReadingSelection={text:string;page?:number;x:number;y:number;image?:string};
function pdfRoot(){return [...document.querySelectorAll<HTMLElement>('.paper-pdf-pane .pdf-continuous-scroll')].at(-1);}
export function useReadingPage(){
  const [page,setPage]=useState(1);
  useEffect(()=>{const update=()=>{const number=Number(pdfRoot()?.dataset.activePage);if(number>0)setPage(number);};update();document.addEventListener('paperly:pdf-page',update);return()=>document.removeEventListener('paperly:pdf-page',update);},[]);
  return page;
}
export function useReadingSelection(){
  const [selection,setSelection]=useState<ReadingSelection|null>(null);
  useEffect(()=>{const capture=(event:Event)=>{
    const target=event.target instanceof Element?event.target:null;
    if(!target?.closest('.paper-pdf-pane,.asset-content-pane')||target.closest('button,input,textarea,select,.pdf-region-selector'))return;
    const selected=window.getSelection();if(!selected||selected.isCollapsed||!selected.rangeCount){setSelection(null);return;}
    const range=selected.getRangeAt(0),start=range.startContainer instanceof Element?range.startContainer:range.startContainer.parentElement,end=range.endContainer instanceof Element?range.endContainer:range.endContainer.parentElement;
    const scope=start?.closest('.paper-pdf-pane,.asset-content-pane');
    if(!scope||!end||!scope.contains(end)||start?.closest('button,input,textarea'))return;
    const text=selected.toString().trim();if(!text||text.length>20000){setSelection(null);return;}
    const rect=range.getBoundingClientRect(),element=start?.closest<HTMLElement>('[data-pdf-page]'),page=Number(element?.dataset.pdfPage)||undefined;
    let image:string|undefined;
    const canvas=element?.querySelector<HTMLCanvasElement>('.pdf-document-canvas');
    if(canvas?.width&&canvas.dataset.rendered==='true'){
      try{const bounds=canvas.getBoundingClientRect();image=canvasImage(canvas,canvas.width,canvas.height,selectionCrop(bounds,rect,canvas.width,canvas.height));}catch{/* Text remains available when a visual selection spans unloaded pages. */}
    }
    setSelection({text,page,image,x:Math.min(window.innerWidth-150,Math.max(12,rect.left)),y:Math.min(window.innerHeight-50,Math.max(12,rect.bottom+7))});
  };
    document.addEventListener('pointerup',capture);document.addEventListener('keyup',capture);return()=>{document.removeEventListener('pointerup',capture);document.removeEventListener('keyup',capture);};},[]);
  return {selection,setSelection};
}
export function checkDocumentText(text:string){if(!text.trim())throw new Error('未提取到可读文字。扫描件可使用“解释公式”发送当前页截图，也可以粘贴文字提问。');if(text.length>350000)throw new Error('全文超过 35 万字符，请改用选中文字提问，避免截断文献。');return text;}
export function currentPdfPage(){
  const root=pdfRoot();if(!root)throw new Error('请先在平台内打开文献');
  const number=Number(root.dataset.activePage);if(!Number.isInteger(number)||number<1)throw new Error('尚未确定当前页，请先返回论文分页');
  const page=root.querySelector<HTMLElement>(`[data-pdf-page="${number}"]`),canvas=page?.querySelector<HTMLCanvasElement>('.pdf-document-canvas');
  if(!canvas?.width||canvas.dataset.rendered!=='true')throw new Error(`第 ${number} 页仍在加载，请稍后重试`);
  return {page:number,canvas,element:page!};
}
export function canvasImage(source:CanvasImageSource,width:number,height:number,crop?:{x:number;y:number;width:number;height:number}){
  const region=crop||{x:0,y:0,width,height},scale=Math.min(1,1800/Math.max(region.width,region.height)),canvas=document.createElement('canvas');
  canvas.width=Math.max(1,Math.round(region.width*scale));canvas.height=Math.max(1,Math.round(region.height*scale));
  const context=canvas.getContext('2d')!;context.fillStyle='#fff';context.fillRect(0,0,canvas.width,canvas.height);context.drawImage(source,region.x,region.y,region.width,region.height,0,0,canvas.width,canvas.height);
  const image=canvas.toDataURL('image/jpeg',.88);if(image.length>3000000)throw new Error('截图过大，请缩小页面后重试');return image;
}
export function selectionContext(selection:ReadingSelection):ReadingContext{return {kind:'selection',text:selection.text,page:selection.page,...(selection.image?{image:selection.image}:{})};}
export function currentPageContext():ReadingContext{
  const current=currentPdfPage(),text=[...current.element.querySelectorAll('.pdf-selectable-text span')].map(element=>element.textContent).join(' ');
  return {kind:'page',page:current.page,text:`本次问题依据当前文献第 ${current.page} 页。请结合此页截图与文字回答，不要用历史页替代当前页。\n${text}`,image:canvasImage(current.canvas,current.canvas.width,current.canvas.height)};
}
export async function documentContext(paper:PaperData,getWordText?:()=>Promise<string>):Promise<ReadingContext>{
  const kind=getAssetKind(paper);
  if(kind==='image'){
    const image=new Image();image.src=fileUrl(paper.fileId!,true);await image.decode();return {kind:'image',text:`图片：${paper.title}${paper.remark?'\n备注：'+paper.remark:''}`,image:canvasImage(image,image.naturalWidth,image.naturalHeight)};
  }
  if(kind==='word'){if(!getWordText)throw new Error('请先打开 Word 编辑器');return {kind:'document',text:checkDocumentText(await getWordText())};}
  const {openPdf}=await import('./pdf'),pdf=await openPdf(pdfBaseUrl(paper.fileId!));
  try{const sections:string[]=[];let length=0;for(let number=1;number<=pdf.numPages;number++){const page=await pdf.getPage(number),content=await page.getTextContent();const text=content.items.map(item=>'str' in item?item.str+(item.hasEOL?'\n':' '):'').join('');length+=text.length;if(length>350000)throw new Error('全文超过 35 万字符，请改用选中文字提问，避免截断文献。');sections.push(`[第 ${number} 页]\n${text}`);}if(sections.every(section=>section.replace(/^\[第 \d+ 页\]\s*/,'').trim().length<3))throw new Error('此 PDF 未提取到文字。可以选用“解释公式”发送当前页截图，或粘贴 OCR 文字。');return {kind:'document',text:checkDocumentText(sections.join('\n\n')),pages:pdf.numPages};}finally{await pdf.destroy();}
}
export function formulaContext(selection:ReadingSelection|null):ReadingContext{
  if(selection)return selectionContext(selection);
  const current=currentPageContext();return {...current,text:current.text+'\n请识别本页公式；如有多个公式，请按顺序解释，并询问需要进一步推导哪一个。'};
}
