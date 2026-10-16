import type { AiModel, AiStatus, Conversation, ConversationPage, ReadingContext } from './ai-types';
import type { NoteAnchor } from './types';

export async function aiRequest<T>(path:string,init?:RequestInit):Promise<T>{
  const response=await fetch('/api/ai'+path,init);
  if(!response.ok){let message='无法连接本地 AI 服务，请检查后端';try{message=(await response.json()).error||message;}catch{/* Non-JSON service/proxy error. */}throw new Error(message);}
  return response.json() as Promise<T>;
}
export const aiJson=(value:unknown,method='POST'):RequestInit=>({method,headers:{'Content-Type':'application/json'},body:JSON.stringify(value)});
export const aiStatus=()=>aiRequest<AiStatus>('/status');
export const aiModels=()=>aiRequest<{models:AiModel[]}>('/models');
export const listConversations=(params:URLSearchParams)=>aiRequest<ConversationPage>('/conversations?'+params);
export const getConversation=(id:string)=>aiRequest<Conversation>('/conversations/'+encodeURIComponent(id));
export const createConversation=(fileId:string,anchor:NoteAnchor)=>aiRequest<Conversation>('/conversations',aiJson({fileId,anchor}));
export const renameConversation=(id:string,title:string)=>aiRequest<Conversation>('/conversations/'+encodeURIComponent(id),aiJson({title},'PUT'));
export const deleteConversation=(id:string)=>aiRequest('/conversations/'+encodeURIComponent(id),{method:'DELETE'});
export const linkAnswerNote=(id:string,messageId:string,anchor:NoteAnchor)=>aiRequest<Conversation>(`/conversations/${encodeURIComponent(id)}/note`,aiJson({messageId,anchor}));
export async function streamAnswer(id:string,text:string,model:string,context:ReadingContext|null,onEvent:(event:string,value:unknown)=>void,signal:AbortSignal,effort?:string){
  const response=await fetch(`/api/ai/conversations/${encodeURIComponent(id)}/messages`,{...aiJson({text,model,effort,context,requestId:crypto.randomUUID()}),signal});
  if(!response.ok){let message='发送失败，请重试';try{message=(await response.json()).error||message;}catch{/* Non-JSON error. */}throw new Error(message);}
  if(!response.body)throw new Error('浏览器无法读取流式响应');
  const reader=response.body.getReader(),decoder=new TextDecoder();let buffer='';let terminal=false;
  try{while(true){const {done,value}=await reader.read();if(done)break;buffer+=decoder.decode(value,{stream:true});let end;while((end=buffer.indexOf('\n\n'))>=0){const frame=buffer.slice(0,end);buffer=buffer.slice(end+2);const lines=frame.split('\n'),event=lines.find(line=>line.startsWith('event:'))?.slice(6).trim(),data=lines.filter(line=>line.startsWith('data:')).map(line=>line.slice(5).trimStart()).join('\n');if(!event||!data)continue;const parsed=JSON.parse(data);if(event==='error')throw new Error(parsed.error);if(event==='conversation')terminal=!(parsed as Conversation).messages.some(message=>message.status==='streaming');onEvent(event,parsed);}}}
  finally{reader.releaseLock();}
  if(!terminal)throw new Error('连接已中断，正在重新读取已保存的对话');
}
