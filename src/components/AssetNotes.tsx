import { useState } from 'react';
import { Link2,MessageSquare,PanelRightClose,PenLine,Plus } from 'lucide-react';
import type { ReactNode } from 'react';
import type { FileReaderProps } from './file-reader-types';
import InkEditor from './InkEditor';
import SplitDivider,{useNoteSplit} from './SplitDivider';
import { NotePicker } from './PaperReader';
import ReadingSidebar from './ReadingSidebar';

export default function AssetNotes({reader,children,getWordText}:{reader:FileReaderProps;children:ReactNode;getWordText?:()=>Promise<string>}){
  const {paper,anchor,workspace,saveState,onCreateNote,onUpdateNote,onBindNote}=reader;
  const split=useNoteSplit('reader');const [noteId,setNoteId]=useState<string|null>(null),[picker,setPicker]=useState(false),[expanded,setExpanded]=useState(false);
  const [sideOpen,setSideOpen]=useState(true),[tab,setTab]=useState<'notes'|'ai'>('notes');
  const create=()=>{setNoteId(onCreateNote());setExpanded(false);setSideOpen(true);setTab('notes');};
  const linked=workspace.handwrittenNotes.filter(n=>!n.deletedAt&&(n.fileId===paper.fileId||n.anchor?.boardId===anchor.boardId&&n.anchor?.nodeId===anchor.nodeId));
  const note=workspace.handwrittenNotes.find(n=>n.id===noteId&&!n.deletedAt);
  return <><div className="asset-note-toolbar"><span>独立手写笔记 · 自动关联当前文件</span><div><button className="secondary-button" onClick={()=>{setSideOpen(true);setTab('ai');setExpanded(false);}}><MessageSquare size={14}/>AI 对话</button><button className="secondary-button" onClick={()=>setPicker(true)}><Link2 size={14}/>关联笔记{linked.length>0&&` (${linked.length})`}</button><button className="secondary-button" onClick={create}><Plus size={14}/>右侧新建空白笔记</button>{note&&<button className="icon-button" aria-label="收起右侧笔记" title="收起右侧笔记" onClick={()=>{setNoteId(null);setExpanded(false);}}><PanelRightClose size={16}/></button>}</div></div>
  <div ref={split.container} style={split.style} className={`paper-reader-panes asset-panes ${sideOpen?'has-note':''} ${expanded&&tab==='notes'?'note-expanded':''}`}><div className="asset-content-pane">{children}</div>{sideOpen&&<><SplitDivider container={split.container} size={split.size} onChange={split.setSize}/><aside className="paper-note-pane reading-sidebar"><ReadingSidebar reader={reader} tab={tab} onTab={tab=>{setTab(tab);setExpanded(false);}} onClose={()=>setSideOpen(false)} getWordText={getWordText}>{note?<InkEditor key={note.id} note={note} embedded saveState={saveState} anchorTitle={paper.title} boardTitle="当前文件" onUpdate={patch=>onUpdateNote(note.id,patch)} onClose={()=>setNoteId(null)} onLink={()=>setPicker(true)} onLocate={()=>setExpanded(false)} onPresentation={()=>setExpanded(v=>!v)}/>:<div className="reading-notes-empty"><PenLine size={28}/><h3>记录此刻的思考</h3><p>新建手写笔记，自动关联当前文件。</p><button className="primary-button" onClick={create}><Plus size={14}/>新建空白笔记</button>{linked.length>0&&<button className="secondary-button" onClick={()=>setPicker(true)}><Link2 size={14}/>打开关联笔记 ({linked.length})</button>}</div>}</ReadingSidebar></aside></>}</div>
  {picker&&<NotePicker notes={workspace.handwrittenNotes} linkedIds={new Set(linked.map(n=>n.id))} purpose="side" onClose={()=>setPicker(false)} onChoose={chosen=>{if(!linked.some(n=>n.id===chosen.id))onBindNote(chosen.id);setNoteId(chosen.id);setExpanded(false);setSideOpen(true);setTab('notes');setPicker(false);}}/>}</>;
}
