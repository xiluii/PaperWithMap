import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { FileText, MessageSquare, PenLine, Plus, Quote, X } from 'lucide-react';
import DOMPurify from 'dompurify';
import type { FileReaderProps } from './file-reader-types';
import type { ConversationSummary } from '../ai-types';
import { listConversations } from '../ai-backend';
import { useAi } from '../AiProvider';
import { useReadingSelection } from '../reading-context';
import AiChatPanel from './AiChatPanel';
import { Modal } from './Dialogs';

type Props={reader:FileReaderProps;tab:'notes'|'ai';onTab:(tab:'notes'|'ai')=>void;onClose:()=>void;children:ReactNode;getWordText?:()=>Promise<string>};
export default function ReadingSidebar({reader,tab,onTab,onClose,children,getWordText}:Props){
  const {paper,anchor,onSaveAiNote}=reader,ai=useAi();
  const [id,setId]=useState<string|null>(null),[items,setItems]=useState<ConversationSummary[]>([]),[error,setError]=useState('');const initialized=useRef(false);
  const {selection,setSelection}=useReadingSelection();
  useEffect(()=>{let live=true;listConversations(new URLSearchParams({fileId:paper.fileId!})).then(page=>{if(!live)return;setItems(page.items);if(!initialized.current){initialized.current=true;setId(page.items[0]?.id||null);}}).catch(error=>{if(live)setError(error.message);});return()=>{live=false;};},[paper.fileId,ai.version]);
  return <><div className="reading-sidebar-tabs" role="tablist" aria-label="阅读侧栏"><button role="tab" aria-selected={tab==='notes'} aria-controls="reading-notes-panel" className={tab==='notes'?'active':''} onClick={()=>onTab('notes')}><PenLine size={15}/>手写笔记</button><button role="tab" aria-selected={tab==='ai'} aria-controls="reading-ai-panel" className={tab==='ai'?'active':''} onClick={()=>onTab('ai')}><MessageSquare size={15}/>AI 对话<span className="reading-ai-dot"/></button><button className="icon-button close-reading-sidebar" title="收起阅读侧栏" aria-label="收起阅读侧栏" onClick={onClose}><X size={15}/></button></div>
    {tab==='ai'?<div id="reading-ai-panel" role="tabpanel" className="reading-ai-panel"><div className="reading-chat-toolbar"><select aria-label="当前文献的对话" value={id||''} onChange={event=>setId(event.target.value||null)}><option value="">新的文献对话</option>{id&&!items.some(item=>item.id===id)&&<option value={id}>{ai.conversations[id]?.title||'当前对话'}</option>}{items.map(item=><option key={item.id} value={item.id}>{item.title}</option>)}</select><button title="新建文献对话" aria-label="新建文献对话" onClick={()=>{initialized.current=true;setId(null);}}><Plus size={14}/>新对话</button></div>{error&&<p className="ai-inline-error">{error}</p>}<AiChatPanel key={`${paper.fileId}:${id||'new'}`} conversationId={id} onConversation={setId} source={{paper,anchor}} selection={selection} onClearSelection={()=>setSelection(current=>current===selection?null:current)} getWordText={getWordText} onSaveNote={onSaveAiNote}/></div>:<div id="reading-notes-panel" role="tabpanel" className="reading-notes-panel">{children}<SavedReadingNotes reader={reader}/></div>}
    {selection&&tab==='notes'&&<button className="reading-selection-action" style={{left:selection.x,top:selection.y}} onPointerDown={event=>event.preventDefault()} onClick={()=>onTab('ai')}><Quote size={14}/>向 AI 提问</button>}
  </>;
}
function SavedReadingNotes({reader}:{reader:FileReaderProps}){
  const [selected,setSelected]=useState<string|null>(null),notes=reader.workspace.boards.flatMap(board=>board.nodes.flatMap(node=>node.type==='text'&&node.data.aiSource&&node.data.sourceFileId===reader.paper.fileId?[node]:[]));
  const note=notes.find(note=>note.id===selected);
  if(!notes.length)return null;
  return <div className="reading-saved-notes"><div><FileText size={13}/><b>AI 阅读笔记</b><small>{notes.length}</small></div><div className="reading-saved-note-list">{notes.map(note=><button key={note.id} onClick={()=>setSelected(note.id)}><FileText size={13}/><span>{note.data.title}</span></button>)}</div>{note&&<Modal title={note.data.title} onClose={()=>setSelected(null)} className="ai-note-preview"><div className="ai-markdown" dangerouslySetInnerHTML={{__html:DOMPurify.sanitize(note.data.html)}}/></Modal>}</div>;
}
