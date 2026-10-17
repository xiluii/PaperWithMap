import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { FileText, Plus, Quote } from 'lucide-react';
import DOMPurify from 'dompurify';
import type { FileReaderProps } from './file-reader-types';
import type { ConversationSummary } from '../ai-types';
import { listConversations } from '../ai-backend';
import { useAi } from '../AiProvider';
import { useReadingSelection } from '../reading-context';
import AiChatPanel from './AiChatPanel';
import { Modal } from './Dialogs';
import { useReadingTranslation } from './ReadingTranslation';

type Props={reader:FileReaderProps;onOpen:()=>void;getWordText?:()=>Promise<string>};
export default function ReadingSidebar({reader,onOpen,getWordText}:Props){
  const {paper,anchor,onSaveAiNote}=reader,ai=useAi();
  const [id,setId]=useState<string|null>(null),[items,setItems]=useState<ConversationSummary[]>([]),[error,setError]=useState('');const initialized=useRef(false);
  const {selection,setSelection}=useReadingSelection();
  const [asked,setAsked]=useState<typeof selection>(null);
  const translation=useReadingTranslation(),askAi=translation?.askAi;
  const open=useRef(onOpen);open.current=onOpen;
  const ask=(selected:NonNullable<typeof selection>)=>{setSelection(selected);setAsked(selected);open.current();requestAnimationFrame(()=>document.querySelector<HTMLTextAreaElement>('.reading-ai-pane textarea')?.focus({preventScroll:true}));};
  useEffect(()=>{if(!askAi)return;askAi.current=ask;return()=>{askAi.current=null;};},[askAi]);
  useEffect(()=>{let live=true;listConversations(new URLSearchParams({fileId:paper.fileId!})).then(page=>{if(!live)return;setItems(page.items);if(!initialized.current){initialized.current=true;setId(page.items[0]?.id||null);}}).catch(error=>{if(live)setError(error.message);});return()=>{live=false;};},[paper.fileId,ai.version]);
  return <><div id="reading-ai-panel" className="reading-ai-panel"><div className="reading-chat-toolbar"><select aria-label="当前文献的对话" value={id||''} onChange={event=>setId(event.target.value||null)}><option value="">新的文献对话</option>{id&&!items.some(item=>item.id===id)&&<option value={id}>{ai.conversations[id]?.title||'当前对话'}</option>}{items.map(item=><option key={item.id} value={item.id}>{item.title}</option>)}</select><button title="新建文献对话" aria-label="新建文献对话" onClick={()=>{initialized.current=true;setId(null);}}><Plus size={14}/>新对话</button></div>{error&&<p className="ai-inline-error">{error}</p>}<AiChatPanel compact key={`${paper.fileId}:${id||'new'}`} conversationId={id} onConversation={setId} source={{paper,anchor}} selection={selection} onClearSelection={()=>setSelection(current=>current===selection?null:current)} getWordText={getWordText} onSaveNote={onSaveAiNote}/></div>
    {selection&&selection!==asked&&!translation?.enabled&&createPortal(<button className="reading-selection-action" style={{left:selection.x,top:selection.y}} onPointerDown={event=>event.preventDefault()} onClick={()=>ask(selection)}><Quote size={14}/>向 AI 提问</button>,document.querySelector('.paper-reader-modal')||document.body)}
  </>;
}
export function SavedReadingNotes({reader}:{reader:FileReaderProps}){
  const [selected,setSelected]=useState<string|null>(null),notes=reader.workspace.boards.flatMap(board=>board.nodes.flatMap(node=>node.type==='text'&&node.data.aiSource&&node.data.sourceFileId===reader.paper.fileId?[node]:[]));
  const note=notes.find(note=>note.id===selected);
  if(!notes.length)return null;
  return <div className="reading-saved-notes"><div><FileText size={13}/><b>AI 阅读笔记</b><small>{notes.length}</small></div><div className="reading-saved-note-list">{notes.map(note=><button key={note.id} onClick={()=>setSelected(note.id)}><FileText size={13}/><span>{note.data.title}</span></button>)}</div>{note&&<Modal title={note.data.title} onClose={()=>setSelected(null)} className="ai-note-preview"><div className="ai-markdown" dangerouslySetInnerHTML={{__html:DOMPurify.sanitize(note.data.html)}}/></Modal>}</div>;
}
