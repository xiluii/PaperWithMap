import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { uploadPdf } from './backend';
import type { PaperData } from './types';
import { uid, now } from './model';

GlobalWorkerOptions.workerSrc=workerUrl;
export const openPdf=(url:string)=>getDocument({url}).promise;
export async function parsePdf(file: File): Promise<PaperData> {
  const loading=getDocument({data:new Uint8Array(await file.arrayBuffer())});
  const pdf=await loading.promise;
  try {
    const metadata=await pdf.getMetadata();
    const info=metadata.info as {Title?:string;Author?:string;CreationDate?:string};
    const page=await pdf.getPage(1);
    const content=await page.getTextContent();
    const items=content.items.filter((i): i is typeof i & {str:string;height:number;transform:number[]}=>'str' in i && Boolean(i.str.trim()));
    const top=items.filter(i=>i.transform[5]>page.view[3]*.52 && i.str.trim().length>2);
    const maxHeight=Math.max(0,...top.map(i=>i.height));
    const titleLine=top.filter(i=>i.height>=maxHeight*.87 && maxHeight>0).map(i=>i.str).join(' ').trim();
    const badTitle=/^(untitled|microsoft|latex|word|document|[a-z]:\\)/i;
    const title=(info.Title && info.Title.trim().length>5 && !badTitle.test(info.Title) ? info.Title : titleLine.length>7 ? titleLine : file.name.replace(/\.pdf$/i,'').replace(/[_-]/g,' ')).slice(0,300);
    const firstText=items.map(i=>i.str).join(' ');
    const yearMatch=firstText.match(/\b(19[89]\d|20[0-2]\d)\b/)||file.name.match(/\b(19[89]\d|20[0-2]\d)\b/);
    const year=yearMatch?Number(yearMatch[1]):new Date().getFullYear();
    const viewport=page.getViewport({scale:.65});
    const canvas=document.createElement('canvas');
    canvas.width=viewport.width;canvas.height=viewport.height;
    await page.render({canvas,viewport}).promise;
    const thumbnail=canvas.toDataURL('image/webp',.72);
    const fileId=uid();
    await uploadPdf(fileId,file,file.name);
    return {title,authors:info.Author?.trim()||'作者待补充',year,venue:'本地文献',tags:['新导入'],status:'unread',starred:false,abstract:'',addedAt:now(),fileId,fileName:file.name,thumbnail,pages:pdf.numPages,accent:'sage'};
  } finally {await pdf.destroy();}
}
