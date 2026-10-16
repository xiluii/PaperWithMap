import { get, set } from 'idb-keyval';
import type { FileInfo,PdfAnnotations, Workspace } from './types';
import { isWorkspace } from './model';

async function request<T>(url:string,init?:RequestInit):Promise<T>{
  const response=await fetch('/api'+url,init);
  if(!response.ok){let message='本地服务不可用，请确认后端已启动';try{message=(await response.json()).error||message;}catch{/* Proxy or service failure. */}throw new Error(message);}
  return response.json() as Promise<T>;
}
const json=(value:unknown):RequestInit=>({method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(value)});
export const backendHealth=()=>request<{ok:boolean;dataDirectory:string}>('/health');
export const fileUrl=(id:string,original=false)=>`/api/files/${encodeURIComponent(id)}/${original?'original':'content'}`;
export const pdfBaseUrl=(id:string)=>`/api/files/${encodeURIComponent(id)}/base`;
export const uploadPdf=(id:string,blob:Blob,name:string)=>request(`/files/${encodeURIComponent(id)}?name=${encodeURIComponent(name)}`,{method:'PUT',headers:{'Content-Type':'application/pdf'},body:blob});
export const uploadAsset=(id:string,file:File)=>request<FileInfo>(`/files/${encodeURIComponent(id)}?name=${encodeURIComponent(file.name)}`,{method:'PUT',headers:{'Content-Type':file.type||'application/octet-stream'},body:file});
export const assetInfo=(id:string)=>request<FileInfo>(`/files/${encodeURIComponent(id)}/info`);
export const retryPreview=(id:string)=>request<FileInfo>(`/files/${encodeURIComponent(id)}/preview`,{...json({}),method:'POST'});
export const thumbnailUrl=(id:string)=>`/api/files/${encodeURIComponent(id)}/thumbnail`;
export const saveWordDocument=(id:string,blob:Blob,revision:string)=>request<FileInfo>(`/files/${encodeURIComponent(id)}/document`,{method:'PUT',headers:{'Content-Type':'application/vnd.openxmlformats-officedocument.wordprocessingml.document','If-Match':revision},body:blob});
export const loadAnnotations=(id:string)=>request<PdfAnnotations>(`/files/${encodeURIComponent(id)}/annotations`);
export const saveAnnotations=(id:string,value:PdfAnnotations)=>request<PdfAnnotations>(`/files/${encodeURIComponent(id)}/annotations`,json(value));
export const openDefaultPdf=(id:string)=>request(`/files/${encodeURIComponent(id)}/open`,{...json({}),method:'POST'});
export const openDefaultFile=openDefaultPdf;
export const openDataFolder=()=>request('/storage/open',{...json({}),method:'POST'});
export async function loadWorkspace(fallback:Workspace,onWarning?:(message:string)=>void):Promise<Workspace>{
  const saved=await request<unknown>('/workspace');
  if(saved!==null){if(!isWorkspace(saved))throw new Error('本地工作区数据格式无效，请检查 workspace.json 备份');return saved;}
  const legacy=await get('paperly:workspace').catch(()=>null);
  const workspace=isWorkspace(legacy)?{...legacy,handwrittenNotes:legacy.handwrittenNotes||[]}:fallback;
  const files=new Map(workspace.boards.flatMap(b=>b.nodes.flatMap(n=>n.type==='paper'&&n.data.fileId?[[n.data.fileId,n.data.fileName||'paper.pdf'] as const]:[])));
  const missing:string[]=[];
  for(const [id,name] of files){const blob=await get<Blob>('pdf:'+id);if(!blob){missing.push(name);continue;}await uploadPdf(id,blob,name);}
  await request('/workspace',json(workspace));
  if(missing.length)onWarning?.(`工作区已迁移；${missing.length} 个 PDF 在旧浏览器存储中缺失，请重新导入：${missing.join('、')}`);
  return workspace;
}
let writes:Promise<unknown>=Promise.resolve();
export function persistWorkspace(workspace:Workspace):Promise<void>{
  void set('paperly:workspace',workspace).catch(()=>{});
  const next=writes.catch(()=>{}).then(()=>request('/workspace',json(workspace))).then(()=>{});
  writes=next;return next;
}
export function flushWorkspace(workspace:Workspace){
  void set('paperly:workspace',workspace).catch(()=>{});
  void writes.catch(()=>{}).then(()=>fetch('/api/workspace',{...json(workspace),keepalive:true})).catch(()=>{});
}
