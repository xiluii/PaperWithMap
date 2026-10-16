import { useEffect, useState } from 'react';
import type { ReadingContext } from './ai-types';
import type { PaperData } from './types';
import { getAssetKind } from './asset-model';
import { fileUrl, pdfBaseUrl } from './backend';

export type ReadingSelection={text:string;page?:number;x:number;y:number};
export function useReadingSelection(){
  const [selection,setSelection]=useState<ReadingSelection|null>(null);
  useEffect(()=>{const capture=()=>{const selected=window.getSelection();if(!selected||selected.isCollapsed||!selected.rangeCount)return;const range=selected.getRangeAt(0),element=range.commonAncestorContainer.nodeType===1?range.commonAncestorContainer as Element:range.commonAncestorContainer.parentElement;
    if(!element?.closest('.paper-pdf-pane,.asset-content-pane')||element.closest('button,input,textarea'))return;
    const text=selected.toString().trim();if(!text||text.length>20000)return;const rect=range.getBoundingClientRect(),page=Number(element.closest('[data-pdf-page]')?.getAttribute('data-pdf-page'))||undefined;setSelection({text,page,x:Math.min(window.innerWidth-150,Math.max(12,rect.left)),y:Math.min(window.innerHeight-50,Math.max(12,rect.bottom+7))});};
    document.addEventListener('mouseup',capture);document.addEventListener('keyup',capture);return()=>{document.removeEventListener('mouseup',capture);document.removeEventListener('keyup',capture);};},[]);
  return {selection,setSelection};
}
export function checkDocumentText(text:string){if(!text.trim())throw new Error('未提取到可读文字。扫描件可使用“解释公式”发送当前页截图，也可以粘贴文字提问。');if(text.length>350000)throw new Error('全文超过 35 万字符，请改用选中文字提问，避免截断文献。');return text;}
export function currentPdfPage(){
  const root=document.querySelector<HTMLElement>('.paper-pdf-pane .pdf-continuous-scroll');if(!root)throw new Error('请先在平台内打开文献');const bounds=root.getBoundingClientRect();
  const pages=[...root.querySelectorAll<HTMLElement>('[data-pdf-page]')];
  const page=pages.sort((a,b)=>{const visible=(node:HTMLElement)=>{const r=node.getBoundingClientRect();return Math.max(0,Math.min(bounds.bottom,r.bottom)-Math.max(bounds.top,r.top));};return visible(b)-visible(a);})[0];
  const canvas=page?.querySelector<HTMLCanvasElement>('.pdf-document-canvas');if(!canvas?.width)throw new Error('当前页面仍在加载，请稍后重试');return {page:Number(page.dataset.pdfPage),canvas};
}
function canvasImage(source:CanvasImageSource,width:number,height:number){
  const scale=Math.min(1,1800/Math.max(width,height)),canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(width*scale));canvas.height=Math.max(1,Math.round(height*scale));const context=canvas.getContext('2d')!;context.fillStyle='#fff';context.fillRect(0,0,canvas.width,canvas.height);context.drawImage(source,0,0,canvas.width,canvas.height);const image=canvas.toDataURL('image/jpeg',.88);if(image.length>3000000)throw new Error('截图过大，请缩小页面后重试');return image;
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
  if(selection)return {kind:'selection',text:selection.text,page:selection.page};
  const current=currentPdfPage();return {kind:'page',page:current.page,text:`当前文献第 ${current.page} 页的截图。请识别该页公式；如有多个公式，请按顺序简要解释，并询问需要进一步推导哪一个。`,image:canvasImage(current.canvas,current.canvas.width,current.canvas.height)};
}
