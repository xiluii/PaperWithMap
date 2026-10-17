import FloatingToolbar from './components/FloatingToolbar';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ConversationHistory from './components/ConversationHistory';
import AiMarkdown from './components/AiMarkdown';
import ThemeControl from './components/ThemeControl';
import { useTheme } from './ThemeProvider';
import type { SaveAiNote } from './ai-types';
import { ReactFlow, Background, BackgroundVariant, MiniMap, ConnectionMode, applyNodeChanges, applyEdgeChanges, useReactFlow, useViewport } from '@xyflow/react';
import type { Connection, NodeChange, EdgeChange, Viewport } from '@xyflow/react';
import { backendHealth, flushWorkspace, loadWorkspace, openDataFolder, openDefaultFile, persistWorkspace } from './backend';
import { Copy, Trash2, Monitor, CheckSquare, Pencil, ArrowDownToLine, ArrowRight, BookOpen, Check, ChevronDown, ChevronRight, CircleHelp, CircleCheck, Ellipsis, FilePlus2, FileText, Filter, Focus, Grid2X2, Hand, History, Keyboard, LayoutDashboard, Link2, LoaderCircle, Magnet, Map, Maximize, Minus, MousePointer2, Network, PenLine, Plus, Redo2, Search, Settings2, Star, StickyNote, MessageSquare, Undo2, Upload, X } from 'lucide-react';
import type { MouseEvent as ReactMouseEvent } from 'react';
import { useContextMenu } from './components/ContextMenu';
import { menuSeparator, nativeContextTarget } from './context-menu';
import type { ContextMenuItem } from './context-menu';
import { duplicateCards } from './canvas-commands';
import type { AppNode, AppEdge, Board, CardAppearance, PaperData, TextData, Workspace, ViewMode, LayoutMode, HandwrittenNote, InkTheme, NoteAnchor, BoardSnapshot } from './types';
import { changeLayout, makeEdge, now, paperNodes, removeNodes, safeFilename, uid } from './model';
import { initialWorkspace } from './seed';
import { anchorDetails, newHandwrittenNote, reconcileAnchors, restoreBoard, snapshotBoard } from './ink-model';
import HandwritingLibrary, { CardNotesDialog, LinkNoteDialog } from './components/HandwritingLibrary';
import InkEditor from './components/InkEditor';
import FileReader from './components/FileReader';
import { ACCEPTED_FILES,compareAssets,kindFromName,timelineGroup } from './asset-model';
import { importAsset } from './import-assets';
import { NodeActions, nodeTypes } from './components/Nodes';
import Inspector from './components/Inspector';
import CardAppearanceSettings from './components/CardAppearanceSettings';
import CanvasChromeControls from './components/CanvasChromeControls';
import type { CanvasChrome } from './components/CanvasChromeControls';
import { patchCardAppearance } from './card-model';
import Library from './components/Library';
import {SidebarControls,useDockSide,usePanelWidth} from './components/PanelControls';
import { BoardDialog, HelpDialog, Modal, Reader, SearchDialog } from './components/Dialogs';

type Toast={id:number;text:string;undo?:boolean};
const snapGrid:[number,number]=[20,20];
const fitOptions={padding:.12,maxZoom:1,minZoom:.12};
const allowedModes:LayoutMode[]=['canvas','timeline','graph'];
function savedInkSession(){try{return sessionStorage.getItem('paperly:open-ink');}catch{return null;}}

function savedCanvasChrome():CanvasChrome{
  try{
    const saved=JSON.parse(localStorage.getItem('paperly:canvas-chrome')||'null');
    if(saved&&typeof saved.sidebar==='boolean'&&typeof saved.topbar==='boolean')return {sidebar:saved.sidebar,topbar:saved.topbar};
  }catch{/* Display preferences are optional. */}
  return {sidebar:true,topbar:true};
}

export default function App(){
  const {theme,setPreference}=useTheme();
  const contextMenu=useContextMenu();
  const [navWidth,setNavWidth]=usePanelWidth('navigation',224),[navSide,setNavSide]=useDockSide('navigation','left');
  const [boardNoteWidth,setBoardNoteWidth]=usePanelWidth('board-note',480),[boardNoteSide,setBoardNoteSide]=useDockSide('board-note','right');
  const [canvasChrome,setCanvasChrome]=useState<CanvasChrome>(savedCanvasChrome);
  const toggleCanvasFocus=useCallback(()=>setCanvasChrome(current=>current.sidebar||current.topbar?{sidebar:false,topbar:false}:{sidebar:true,topbar:true}),[]);
  const restoreCanvasChrome=useCallback(()=>setCanvasChrome(current=>current.sidebar&&current.topbar?current:{sidebar:true,topbar:true}),[]);
  useEffect(()=>{try{localStorage.setItem('paperly:canvas-chrome',JSON.stringify(canvasChrome));}catch{/* The controls still work without local storage. */}},[canvasChrome]);
  const [workspace,setWorkspace]=useState<Workspace>(initialWorkspace);
  const workspaceRef=useRef(workspace);workspaceRef.current=workspace;
  const [hydrated,setHydrated]=useState(false);
  const [loadError,setLoadError]=useState(''),[loadAttempt,setLoadAttempt]=useState(0);
  const [dataDirectory,setDataDirectory]=useState('');
  const [saveState,setSaveState]=useState<'saved'|'saving'|'error'>('saved');
  const [view,setView]=useState<ViewMode>(()=>savedInkSession()?'handwriting':'board');
  const [selectedConversationId,setSelectedConversationId]=useState<string|null>(null);
  const [openedNoteId,setOpenedNoteId]=useState<string|null>(savedInkSession);
  const [notePresentation,setNotePresentation]=useState<'full'|'split'>('full');
  const [cardNotesAnchor,setCardNotesAnchor]=useState<NoteAnchor|null>(null);
  const [bindingNoteId,setBindingNoteId]=useState<string|null>(null);
  const [selectedId,setSelectedId]=useState<string|null>(null);
  const [appearanceTab,setAppearanceTab]=useState(false);
  const [selectedEdgeId,setSelectedEdgeId]=useState<string|null>(null);
  const [reader,setReader]=useState<{boardId:string;nodeId:string}|null>(null);
  const [dialog,setDialog]=useState<'new'|'settings'|'help'|'search'|'delete'|'storage'|'cards'|null>(null);
  const [tool,setTool]=useState<'select'|'hand'|'connect'>('select');
  const [snap,setSnap]=useState(true);
  const [showMap,setShowMap]=useState(true);
  const [menu,setMenu]=useState(false);
  const [filterOpen,setFilterOpen]=useState(false);
  const [statusFilter,setStatusFilter]=useState('all');
  const [draggingFile,setDraggingFile]=useState(false);
  const [importing,setImporting]=useState(false);
  const [toast,setToast]=useState<Toast|null>(null);
  const [,setHistoryVersion]=useState(0);
  const history=useRef<{past:BoardSnapshot[];future:BoardSnapshot[];last:number}>({past:[],future:[],last:0});
  const fileInput=useRef<HTMLInputElement>(null);
  const flowContainer=useRef<HTMLDivElement>(null);
  const dragDepth=useRef(0);
  const nodeDragging=useRef(false);
  const {fitView,screenToFlowPosition,zoomIn,zoomOut,setViewport,getViewport}=useReactFlow<AppNode,AppEdge>();
  const viewport=useViewport();
  const board=workspace.boards.find(b=>b.id===workspace.activeBoardId)||workspace.boards[0];
  const papers=paperNodes(board.nodes);
  const allPapers=workspace.boards.flatMap(b=>paperNodes(b.nodes));
  const selectedNode=board.nodes.find(n=>n.id===selectedId&&n.type!=='section');
  const selectedEdge=board.edges.find(e=>e.id===selectedEdgeId);
  const readerPaper=reader?workspace.boards.find(b=>b.id===reader.boardId)?.nodes.find(n=>n.id===reader.nodeId&&n.type==='paper'):undefined;
  const openedNote=workspace.handwrittenNotes.find(note=>note.id===openedNoteId&&!note.deletedAt);
  const openedAnchor=anchorDetails(workspace,openedNote?.anchor||null);
  const bindingNote=workspace.handwrittenNotes.find(note=>note.id===bindingNoteId&&!note.deletedAt);
  const notify=useCallback((text:string,undo=false)=>setToast({id:Date.now(),text,undo}),[]);
  const applyWorkspace=useCallback((w:Workspace)=>{const next=reconcileAnchors(w);workspaceRef.current=next;setWorkspace(next);},[]);
  const saveAiNote:SaveAiNote=async(conversation,message)=>{
    const w=workspaceRef.current;
    for(const currentBoard of w.boards){const existing=currentBoard.nodes.find(node=>node.type==='text'&&node.data.aiSource?.conversationId===conversation.id&&node.data.aiSource?.messageId===message.id);if(existing){await persistWorkspace(w);notify('此回答已保存为关联笔记。');return {boardId:currentBoard.id,nodeId:existing.id};}}
    const sourceBoard=w.boards.find(board=>board.id===conversation.source.anchor.boardId),targetBoard=sourceBoard||w.boards.find(board=>board.id===w.activeBoardId)!;
    const sourceNode=targetBoard.nodes.find(node=>node.id===conversation.source.anchor.nodeId&&node.type==='paper');
    const id=uid(),count=targetBoard.nodes.filter(node=>node.type==='text'&&node.data.sourceFileId===conversation.source.fileId).length;
    const node:AppNode={id,type:'text',position:{x:(sourceNode?.position.x||80)+380,y:(sourceNode?.position.y||80)+count*120},data:{title:conversation.title.slice(0,65)+' · 阅读笔记',html:renderToStaticMarkup(<AiMarkdown text={message.text}/>),color:'white',createdAt:now(),sourceFileId:conversation.source.fileId,aiSource:{conversationId:conversation.id,messageId:message.id}}};
    const next={...w,boards:w.boards.map(board=>board.id===targetBoard.id?{...board,nodes:[...board.nodes,node],edges:sourceNode?[...board.edges,makeEdge(sourceNode.id,id,'AI 阅读笔记')]:board.edges,updatedAt:now()}:board)};
    applyWorkspace(next);await persistWorkspace(next);notify('回答已保存为画布文字笔记，并关联来源文献。');return {boardId:targetBoard.id,nodeId:id};
  };

  useEffect(()=>{try{if(openedNoteId&&(view==='handwriting'||notePresentation==='split'))sessionStorage.setItem('paperly:open-ink',openedNoteId);else sessionStorage.removeItem('paperly:open-ink');}catch{/* Session navigation is optional; the workspace still saves in IndexedDB. */}},[openedNoteId,view,notePresentation]);
  useEffect(()=>{if(hydrated&&openedNoteId&&!openedNote)setOpenedNoteId(null);},[hydrated,openedNoteId,openedNote]);

  useEffect(()=>{let live=true;setLoadError('');Promise.all([loadWorkspace(initialWorkspace(),message=>{if(live)notify(message);}),backendHealth()]).then(([saved,health])=>{if(live){applyWorkspace(saved);setDataDirectory(health.dataDirectory);setHydrated(true);}}).catch(e=>{if(live){setLoadError(e.message||'无法连接本地后端');setSaveState('error');}});return()=>{live=false;};},[applyWorkspace,loadAttempt,notify]);
  useEffect(()=>{if(!hydrated)return;let current=true;let timer:ReturnType<typeof setTimeout>;setSaveState('saving');const save=()=>{persistWorkspace(workspace).then(()=>{if(current)setSaveState('saved');}).catch(e=>{if(current){setSaveState('error');notify('保存失败：'+e.message+'。正在自动重试。');timer=setTimeout(save,4000);}});};timer=setTimeout(save,nodeDragging.current?300:180);return()=>{current=false;clearTimeout(timer);};},[workspace,hydrated,notify]);
  useEffect(()=>{const flush=()=>{if(hydrated)flushWorkspace(workspaceRef.current);};window.addEventListener('pagehide',flush);return()=>window.removeEventListener('pagehide',flush);},[hydrated]);
  useEffect(()=>{if(!hydrated||saveState==='saved')return;const before=(e:BeforeUnloadEvent)=>{e.preventDefault();e.returnValue='';};window.addEventListener('beforeunload',before);return()=>window.removeEventListener('beforeunload',before);},[hydrated,saveState]);
  useEffect(()=>{if(!toast)return;const timer=setTimeout(()=>setToast(null),toast.undo?6500:4200);return()=>clearTimeout(timer);},[toast]);
  useEffect(()=>{if(view!=='board')return;const timer=setTimeout(()=>{if(board.id==='llm-research'&&board.mode==='canvas'){const width=flowContainer.current?.clientWidth||1050;const zoom=Math.min(.9,Math.max(.7,(width-155)/988));void setViewport({x:Math.max(48,(width-988*zoom)/2),y:42,zoom},{duration:420});}else void fitView({...fitOptions,duration:450});},110);return()=>clearTimeout(timer);},[board.id,board.mode,view,fitView,setViewport,hydrated]);
  useEffect(()=>{if(!menu&&!filterOpen)return;const close=()=>{setMenu(false);setFilterOpen(false);};window.addEventListener('click',close);return()=>window.removeEventListener('click',close);},[menu,filterOpen]);

  const capture=useCallback((force=false)=>{const w=workspaceRef.current;if(force||Date.now()-history.current.last>650){history.current.past.push(snapshotBoard(w));history.current.past=history.current.past.slice(-40);history.current.future=[];history.current.last=Date.now();setHistoryVersion(v=>v+1);}},[]);
  const mutate=useCallback((fn:(b:Board)=>Board,record=true)=>{if(record)capture();const w=workspaceRef.current;applyWorkspace({...w,boards:w.boards.map(b=>b.id===w.activeBoardId?{...fn(b),updatedAt:now()}:b)});},[applyWorkspace,capture]);
  const undo=useCallback(()=>{const h=history.current;const previous=h.past.pop();if(!previous)return;const w=workspaceRef.current;h.future.push(snapshotBoard(w));h.last=0;applyWorkspace(restoreBoard(w,previous));setSelectedId(null);setSelectedEdgeId(null);setHistoryVersion(v=>v+1);},[applyWorkspace]);
  const redo=useCallback(()=>{const h=history.current;const next=h.future.pop();if(!next)return;const w=workspaceRef.current;h.past.push(snapshotBoard(w));h.last=0;applyWorkspace(restoreBoard(w,next));setHistoryVersion(v=>v+1);},[applyWorkspace]);
  const closeInspector=useCallback(()=>{setSelectedId(null);setSelectedEdgeId(null);mutate(b=>({...b,nodes:b.nodes.map(n=>({...n,selected:false})),edges:b.edges.map(e=>({...e,selected:false}))}),false);},[mutate]);
  const activateBoard=useCallback((id:string)=>{const w=workspaceRef.current;applyWorkspace({...w,activeBoardId:id});setView('board');setOpenedNoteId(null);setSelectedId(null);setSelectedEdgeId(null);setStatusFilter('all');history.current={past:[],future:[],last:0};setHistoryVersion(v=>v+1);},[applyWorkspace]);
  const locate=useCallback((boardId:string,nodeId:string)=>{activateBoard(boardId);setSelectedId(nodeId);setDialog(null);setTimeout(()=>fitView({nodes:[{id:nodeId}],padding:.9,duration:500,maxZoom:1}),150);},[activateBoard,fitView]);

  const updateHandwritten=useCallback((id:string,patch:Partial<HandwrittenNote>)=>{const w=workspaceRef.current;if('anchor' in patch){const target=anchorDetails(w,patch.anchor||null);patch={...patch,fileId:target?.node.type==='paper'?target.node.data.fileId:undefined};}applyWorkspace({...w,handwrittenNotes:w.handwrittenNotes.map(note=>note.id===id?{...note,...patch,id:note.id,updatedAt:now()}:note)});},[applyWorkspace]);
  const openHandwritten=useCallback((id:string,split=false)=>{const w=workspaceRef.current;const note=w.handwrittenNotes.find(n=>n.id===id&&!n.deletedAt);if(!note)return;if(split){const target=anchorDetails(w,note.anchor);if(target&&target.board.id!==w.activeBoardId)activateBoard(target.board.id);else setView('board');}else setView('handwriting');setSelectedId(null);setSelectedEdgeId(null);setOpenedNoteId(id);setNotePresentation(split?'split':'full');setCardNotesAnchor(null);setBindingNoteId(null);setReader(null);},[activateBoard]);
  const createHandwritten=useCallback((anchor:NoteAnchor|null=null,theme:InkTheme='light',split=false)=>{const w=workspaceRef.current;const target=anchorDetails(w,anchor);const note={...newHandwrittenNote(anchor,target?target.node.data.title.slice(0,40)+' · 手写笔记':'手写笔记 '+(w.handwrittenNotes.length+1)),theme};applyWorkspace({...w,handwrittenNotes:[...w.handwrittenNotes,note]});openHandwritten(note.id,split);},[applyWorkspace,openHandwritten]);
  const closeHandwritten=()=>{setOpenedNoteId(null);if(notePresentation==='full')setView('handwriting');};
  const trashHandwritten=(id:string)=>{updateHandwritten(id,{deletedAt:now()});if(openedNoteId===id)setOpenedNoteId(null);notify('笔记已移入回收站，随时可以恢复。');};
  const locateFromNote=(anchor:NoteAnchor)=>{const id=openedNoteId;locate(anchor.boardId,anchor.nodeId);if(id){setOpenedNoteId(id);setNotePresentation('split');}};
  const renderInkEditor=(embedded=false)=>openedNote?<InkEditor key={openedNote.id} note={openedNote} embedded={embedded} saveState={saveState} anchorTitle={openedAnchor?.node.data.title} boardTitle={openedAnchor?.board.title} onUpdate={patch=>updateHandwritten(openedNote.id,patch)} onClose={closeHandwritten} onLink={()=>setBindingNoteId(openedNote.id)} onLocate={()=>{if(openedNote.anchor)locateFromNote(openedNote.anchor);}} onPresentation={()=>openHandwritten(openedNote.id,!embedded)}/>:null;

  const updateSelected=useCallback((data:Partial<PaperData>|Partial<TextData>)=>{mutate(b=>{const next={...b,nodes:b.nodes.map(n=>n.id===selectedId?{...n,data:{...n.data,...data}} as AppNode:n)};return next.mode==='timeline'&&('year' in data||'readAt' in data)?changeLayout(next,'timeline'):next;});},[mutate,selectedId]);
  const updateCardAppearance=useCallback((id:string,patch?:CardAppearance)=>{mutate(b=>({...b,nodes:b.nodes.map(n=>n.id===id&&n.type!=='section'?{...n,data:{...n.data,appearance:patch?patchCardAppearance(n.data.appearance,patch):undefined}} as AppNode:n)}),!nodeDragging.current);},[mutate]);
  const updateCardDefaults=(patch?:CardAppearance)=>mutate(b=>({...b,cardDefaults:patch?patchCardAppearance(b.cardDefaults,patch):undefined}),!nodeDragging.current);
  const beginCardResize=useCallback(()=>{if(nodeDragging.current)return;capture(true);nodeDragging.current=true;},[capture]);
  const endCardResize=useCallback(()=>{if(!nodeDragging.current)return;nodeDragging.current=false;mutate(b=>({...b}),false);},[mutate]);
  const scaleCard=useCallback((id:string,scale:number)=>updateCardAppearance(id,{scale}),[updateCardAppearance]);
  const configureCard=useCallback((id:string)=>{setOpenedNoteId(null);setSelectedId(id);setSelectedEdgeId(null);setAppearanceTab(true);mutate(b=>({...b,nodes:b.nodes.map(n=>({...n,selected:n.id===id}))}),false);},[mutate]);
  const toggleStar=useCallback((boardId:string,id:string)=>{const w=workspaceRef.current;if(boardId===w.activeBoardId)capture();applyWorkspace({...w,boards:w.boards.map(b=>b.id===boardId?{...b,nodes:b.nodes.map(n=>n.id===id&&n.type==='paper'?{...n,data:{...n.data,starred:!n.data.starred}}:n)}:b)});},[applyWorkspace,capture]);
  const addNote=useCallback((position?:{x:number;y:number})=>{const rect=flowContainer.current?.getBoundingClientRect();const pos=position||screenToFlowPosition({x:(rect?.left||0)+(rect?.width||900)*.43,y:(rect?.top||0)+(rect?.height||600)*.38});const id=uid();capture(true);mutate(b=>({...b,nodes:[...b.nodes.map(n=>({...n,selected:false})),{id,type:'text',position:pos,selected:true,data:{title:'新的灵感',html:'<p>在这里写下你的想法…</p>',color:'yellow',createdAt:now()}}]}),false);setSelectedId(id);setSelectedEdgeId(null);setView('board');setTool('select');notify('灵感已落在画布上，在右侧编辑内容。');},[capture,mutate,notify,screenToFlowPosition]);
  const removeSelected=useCallback(()=>{const w=workspaceRef.current;const b=w.boards.find(x=>x.id===w.activeBoardId)!;const ids=selectedEdgeId&&!selectedId?[]:b.nodes.filter(n=>n.selected&&n.type!=='section').map(n=>n.id);if(selectedId&&!ids.includes(selectedId))ids.push(selectedId);const edgeIds=b.edges.filter(e=>e.selected).map(e=>e.id);if(selectedEdgeId)edgeIds.push(selectedEdgeId);if(!ids.length&&!edgeIds.length)return;capture(true);mutate(current=>{const next=removeNodes(current,ids);return {...next,edges:next.edges.filter(e=>!edgeIds.includes(e.id))};},false);setSelectedId(null);setSelectedEdgeId(null);notify(ids.length?`已删除 ${ids.length} 张卡片`:'已删除连接',true);},[capture,mutate,notify,selectedId,selectedEdgeId]);
  const setLayout=useCallback((mode:LayoutMode)=>{closeInspector();capture(true);mutate(b=>changeLayout(b,mode),false);setStatusFilter('all');if(mode==='timeline')notify('已按年份排列。切回自由画布可恢复原有布局。');},[capture,closeInspector,mutate,notify]);
  const onNodesChange=useCallback((changes:NodeChange<AppNode>[])=>{const filtered=changes.filter(c=>!('id' in c)||!c.id.startsWith('timeline-label:'));if(filtered.length)mutate(b=>{const next={...b,nodes:applyNodeChanges(filtered,b.nodes)};return next.mode==='timeline'&&filtered.some(c=>c.type==='dimensions')?changeLayout(next,'timeline'):next;},false);},[mutate]);
  const onEdgesChange=useCallback((changes:EdgeChange<AppEdge>[])=>mutate(b=>({...b,edges:applyEdgeChanges(changes,b.edges)}),false),[mutate]);
  const onConnect=useCallback((connection:Connection)=>{if(!connection.source||!connection.target||connection.source===connection.target)return;const current=workspaceRef.current.boards.find(b=>b.id===workspaceRef.current.activeBoardId)!;if(current.edges.some(e=>e.source===connection.source&&e.target===connection.target)){notify('这两张卡片已建立连接。点击连线可编辑关系。');return;}const edge={...makeEdge(connection.source,connection.target),sourceHandle:connection.sourceHandle,targetHandle:connection.targetHandle};capture(true);mutate(b=>({...b,edges:[...b.edges,edge]}),false);setSelectedId(null);setSelectedEdgeId(edge.id);notify('连接已建立，为这段关系起个名字吧。');},[capture,mutate,notify]);

  const importFiles=useCallback(async(files:File[],position?:{x:number;y:number})=>{
    if(importing)return;
    const accepted=files.filter(f=>kindFromName(f.name));
    if(!accepted.length){notify('请选择 PDF、Word、PPT 或 JPG/PNG 图片。');return;}
    setImporting(true);setDraggingFile(false);const targetBoardId=workspaceRef.current.activeBoardId;
    const rect=flowContainer.current?.getBoundingClientRect();const pos=position||screenToFlowPosition({x:(rect?.left||250)+(rect?.width||1000)*.3,y:(rect?.top||200)+(rect?.height||600)*.25});
    const imported:AppNode[]=[],failed:string[]=files.filter(f=>!kindFromName(f.name)).map(f=>f.name+'：不支持的格式');capture(true);
    try{
      for(const [i,file] of accepted.entries()){try{const data=await importAsset(file);imported.push({id:uid(),type:'paper',position:{x:pos.x+(i%3)*320,y:pos.y+Math.floor(i/3)*365},data});}catch(e){failed.push(file.name+'：'+(e as Error).message);}}
      if(imported.length){const w=workspaceRef.current;applyWorkspace({...w,boards:w.boards.map(b=>{if(b.id!==targetBoardId)return b;const next={...b,nodes:[...b.nodes,...imported],updatedAt:now()};return next.mode==='canvas'?next:changeLayout(next,next.mode);})});setView('board');setStatusFilter('all');if(imported.length===1){setSelectedId(imported[0].id);setTimeout(()=>fitView({nodes:[{id:imported[0].id}],padding:.8,duration:450,maxZoom:1}),180);}else setTimeout(()=>fitView({...fitOptions,duration:450}),180);}
      notify(failed.length?`成功导入 ${imported.length} 个文件；${failed.slice(0,2).join('；')}${failed.length>2?`，另有 ${failed.length-2} 个失败`:''}`:`已导入 ${imported.length} 个文件，可编辑卡片信息并关联笔记。`);
    }finally{setImporting(false);if(fileInput.current)fileInput.current.value='';}
  },[applyWorkspace,capture,fitView,importing,notify,screenToFlowPosition]);
  const openImport=()=>fileInput.current?.click();
  const exportBoard=()=>{const data={version:1,activeBoardId:board.id,boards:[board],handwrittenNotes:workspace.handwrittenNotes.filter(note=>note.anchor?.boardId===board.id)};const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));const anchor=document.createElement('a');anchor.href=url;anchor.download=safeFilename(board.title)+'.paperly.json';anchor.click();setTimeout(()=>URL.revokeObjectURL(url),1000);setMenu(false);notify('白板结构已导出。原文件请随整个数据文件夹备份。');};
  const noteCounts=useMemo(()=>{const counts:Record<string,number>={};for(const note of workspace.handwrittenNotes)if(!note.deletedAt&&note.anchor?.boardId===board.id)counts[note.anchor.nodeId]=(counts[note.anchor.nodeId]||0)+1;return counts;},[workspace.handwrittenNotes,board.id]);
  const nodeActions=useMemo(()=>({open:(id:string)=>setReader({boardId:board.id,nodeId:id}),star:(id:string)=>toggleStar(board.id,id),edit:(id:string)=>{setSelectedId(id);setSelectedEdgeId(null);setAppearanceTab(false);},showNotes:(id:string)=>setCardNotesAnchor({boardId:board.id,nodeId:id}),configure:configureCard,scale:scaleCard,resizeStart:beginCardResize,resizeEnd:endCardResize,cardDefaults:board.cardDefaults,noteCounts}),[board.id,board.cardDefaults,toggleStar,noteCounts,configureCard,scaleCard,beginCardResize,endCardResize]);

  const visibleNodes=useMemo(()=>{const nodes=board.nodes.map(n=>({...n,hidden:n.hidden||(n.type==='paper'&&statusFilter!=='all'&&n.data.status!==statusFilter)}));if(board.mode!=='timeline')return nodes;const by=board.timelineBy||'year';const groups=[...new Set(paperNodes(board.nodes).sort((a,b)=>compareAssets(a.data,b.data,by)).map(n=>timelineGroup(n.data,by)))];return [...nodes,...groups.map((group,i):AppNode=>({id:'timeline-label:'+group,type:'section',position:{x:papers.find(n=>timelineGroup(n.data,by)===group)?.position.x??i*340,y:0},selectable:false,draggable:false,data:{title:group,subtitle:by==='year'?'发表年份':'阅读 / 添加日期'}}))];},[board.nodes,board.mode,board.timelineBy,statusFilter]);

  useEffect(()=>{const key=(e:KeyboardEvent)=>{const target=e.target as HTMLElement;const editing=target.isContentEditable||['INPUT','TEXTAREA','SELECT'].includes(target.tagName);if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='k'){e.preventDefault();setDialog(d=>d==='search'?null:'search');return;}if(e.defaultPrevented||editing||dialog||reader||cardNotesAnchor||bindingNoteId||view==='handwriting'||target.closest('.ink-editor'))return;if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'){e.preventDefault();if(e.shiftKey)redo();else undo();return;}if(view!=='board')return;if(e.shiftKey&&!e.ctrlKey&&!e.metaKey&&!e.altKey&&e.key.toLowerCase()==='f'){e.preventDefault();toggleCanvasFocus();return;}if(e.key==='Delete'||e.key==='Backspace'){e.preventDefault();removeSelected();}if(e.key.toLowerCase()==='n'&&!e.ctrlKey&&!e.metaKey)addNote();if(e.key.toLowerCase()==='h')setTool('hand');if(e.key.toLowerCase()==='v')setTool('select');if(e.key.toLowerCase()==='f')void fitView({...fitOptions,duration:450});if(e.key==='Escape'){closeInspector();restoreCanvasChrome();}};window.addEventListener('keydown',key);return()=>window.removeEventListener('keydown',key);},[addNote,closeInspector,dialog,fitView,reader,redo,removeSelected,undo,view,cardNotesAnchor,bindingNoteId,toggleCanvasFocus,restoreCanvasChrome]);

  // Add a short, frame-based glide after hand panning; programmatic moves do not re-trigger it.
  const motion=useRef({x:0,y:0,time:0,vx:0,vy:0,frame:0});
  useEffect(()=>()=>cancelAnimationFrame(motion.current.frame),[]);
  const onMoveStart=useCallback((event:MouseEvent|TouchEvent|null)=>{if(!event)return;cancelAnimationFrame(motion.current.frame);motion.current.time=0;motion.current.vx=0;motion.current.vy=0;},[]);
  const onMove=useCallback((event:MouseEvent|TouchEvent|null,v:Viewport)=>{if(!event)return;const m=motion.current;const t=performance.now();if(m.time&&t-m.time<80){const dt=Math.max(t-m.time,8);m.vx=(v.x-m.x)/dt;m.vy=(v.y-m.y)/dt;}m.x=v.x;m.y=v.y;m.time=t;},[]);
  const onMoveEnd=useCallback((event:MouseEvent|TouchEvent|null)=>{const m=motion.current;if(!event||!/up|end/.test(event.type)||performance.now()-m.time>90||Math.hypot(m.vx,m.vy)<.15||matchMedia('(prefers-reduced-motion: reduce)').matches)return;let previous=performance.now();const step=(time:number)=>{const dt=Math.min(time-previous,32);previous=time;const decay=Math.pow(.88,dt/16.67);m.vx*=decay;m.vy*=decay;const v=getViewport();void setViewport({...v,x:v.x+m.vx*dt,y:v.y+m.vy*dt});if(Math.hypot(m.vx,m.vy)>.025)m.frame=requestAnimationFrame(step);};m.frame=requestAnimationFrame(step);},[getViewport,setViewport]);

  const openCanvasMenu=(event:ReactMouseEvent|MouseEvent)=>{
    cancelAnimationFrame(motion.current.frame);
    const bounds=(event.target as Element).getBoundingClientRect(),keyboard=!event.clientX&&!event.clientY;
    const position=screenToFlowPosition({x:keyboard?bounds.left+24:event.clientX,y:keyboard?bounds.top+24:event.clientY});
    contextMenu.open(event,'画布操作',[
      {id:'new-text',label:'在此新建文字卡片',icon:StickyNote,shortcut:'N',onSelect:()=>addNote(position)},
      {id:'import',label:'导入文件',icon:FilePlus2,onSelect:openImport},menuSeparator,
      {id:'undo',label:'撤销',icon:Undo2,shortcut:'Ctrl+Z',disabled:!history.current.past.length,onSelect:undo},
      {id:'redo',label:'重做',icon:Redo2,shortcut:'Ctrl+Shift+Z',disabled:!history.current.future.length,onSelect:redo},
      {id:'select-all',label:'选择全部卡片',icon:CheckSquare,disabled:!board.nodes.some(n=>n.type!=='section'),onSelect:()=>{setSelectedId(null);setSelectedEdgeId(null);mutate(b=>({...b,nodes:b.nodes.map(n=>({...n,selected:n.type!=='section'&&!n.hidden})),edges:b.edges.map(e=>({...e,selected:false}))}),false);}},menuSeparator,
      {id:'fit',label:'适应全部内容',icon:Focus,shortcut:'F',onSelect:()=>{void fitView({...fitOptions,duration:450});}},
      {id:'snap',label:'网格吸附',icon:Magnet,checked:snap,onSelect:()=>setSnap(value=>!value)},
      {id:'focus',label:'专注画布',icon:Maximize,checked:!canvasChrome.sidebar&&!canvasChrome.topbar,shortcut:'Shift+F',onSelect:toggleCanvasFocus},
    ]);
  };
  const openCardMenu=(event:ReactMouseEvent,node:AppNode)=>{
    if(nativeContextTarget(event.target as Element))return;
    if(node.type==='section'){openCanvasMenu(event);return;}
    cancelAnimationFrame(motion.current.frame);
    const selected=node.selected?board.nodes.filter(n=>n.selected&&n.type!=='section').map(n=>n.id):[node.id];
    setSelectedId(node.id);setSelectedEdgeId(null);setAppearanceTab(false);
    mutate(b=>({...b,nodes:b.nodes.map(n=>({...n,selected:selected.includes(n.id)})),edges:b.edges.map(e=>({...e,selected:false}))}),false);
    const items:ContextMenuItem[]=[{id:'open',label:node.type==='paper'?'在平台内打开':'编辑文字卡片',icon:node.type==='paper'?BookOpen:Pencil,onSelect:()=>{if(node.type==='paper')setReader({boardId:board.id,nodeId:node.id});else nodeActions.edit(node.id);}}];
    if(node.type==='paper'){
      if(node.data.fileId)items.push({id:'external',label:'用默认软件打开',icon:Monitor,onSelect:async()=>{await openDefaultFile(node.data.fileId!);}});
      items.push({id:'star',label:node.data.starred?'取消收藏':'收藏文件',icon:Star,checked:!!node.data.starred,onSelect:()=>toggleStar(board.id,node.id)});
    }
    items.push(menuSeparator,{id:'notes',label:'查看关联手写笔记',icon:PenLine,onSelect:()=>setCardNotesAnchor({boardId:board.id,nodeId:node.id})},
      {id:'new-note',label:'新建关联手写笔记',icon:Plus,onSelect:()=>createHandwritten({boardId:board.id,nodeId:node.id},'light',true)},
      {id:'appearance',label:'卡片显示与缩放',icon:Settings2,onSelect:()=>configureCard(node.id)},menuSeparator,
      {id:'duplicate',label:selected.length>1?`复制 ${selected.length} 张卡片`:'复制卡片',icon:Copy,onSelect:()=>{capture(true);let id='';mutate(b=>{const result=duplicateCards(b,selected);id=result.ids[0]||'';return result.board;},false);setSelectedId(id||null);notify('卡片已复制，文件仍共享同一份本地原件。',true);}},
      {id:'remove',label:selected.length>1?`移除 ${selected.length} 张卡片`:'移除卡片',icon:Trash2,danger:true,shortcut:'Delete',onSelect:()=>{capture(true);mutate(b=>removeNodes(b,selected),false);setSelectedId(null);setSelectedEdgeId(null);notify(`已移除 ${selected.length} 张卡片，原文件保留。`,true);}});
    contextMenu.open(event,node.data.title,items);
  };
  const openEdgeMenu=(event:ReactMouseEvent,edge:AppEdge)=>{
    setSelectedId(null);setSelectedEdgeId(edge.id);
    contextMenu.open(event,'卡片关系',[
      {id:'edit',label:'编辑关系',icon:Pencil,onSelect:()=>{setSelectedId(null);setSelectedEdgeId(edge.id);}},
      {id:'direction',label:'有向连线',icon:ArrowRight,checked:!!edge.data?.directed,onSelect:()=>mutate(b=>({...b,edges:b.edges.map(e=>e.id===edge.id?{...e,data:{relation:e.data?.relation||'关联',directed:!e.data?.directed},markerEnd:e.data?.directed?undefined:{type:'arrowclosed' as const,color:theme==='dark'?'#77b7c4':'#90a877'}}:e)}))},menuSeparator,
      {id:'remove',label:'删除连线',icon:Trash2,danger:true,shortcut:'Delete',onSelect:()=>{capture(true);mutate(b=>({...b,edges:b.edges.filter(e=>e.id!==edge.id)}),false);setSelectedEdgeId(null);notify('连接已删除。',true);}},
    ]);
  };
  const openWorkspaceMenu=(event:ReactMouseEvent)=>{
    const target=event.target as Element;
    if(nativeContextTarget(target)||target.closest('[role="dialog"]')||window.getSelection()?.toString().trim())return;
    contextMenu.open(event,'Paperly 工作台',[
      {id:'search',label:'搜索文献与笔记',icon:Search,shortcut:'Ctrl+K',onSelect:()=>setDialog('search')},
      {id:'board',label:'返回当前白板',icon:LayoutDashboard,onSelect:()=>{setView('board');setOpenedNoteId(null);}},
      {id:'import',label:'导入文件',icon:FilePlus2,onSelect:openImport},menuSeparator,
      {id:'theme',label:theme==='dark'?'切换浅色模式':'切换暗色模式',icon:Focus,onSelect:()=>setPreference(theme==='dark'?'light':'dark')},
      {id:'help',label:'使用指南与快捷键',icon:CircleHelp,onSelect:()=>setDialog('help')},
    ]);
  };

  const totalNotes=board.nodes.filter(n=>n.type==='text').length;
  const completed=allPapers.filter(n=>n.data.status==='read').length;
  const markReaderRead=()=>{if(!reader)return;const w=workspaceRef.current;applyWorkspace({...w,boards:w.boards.map(b=>{if(b.id!==reader.boardId)return b;const next={...b,nodes:b.nodes.map(n=>n.id===reader.nodeId&&n.type==='paper'?{...n,data:{...n.data,status:'read' as const,readAt:now()}}:n)};return next.mode==='timeline'&&next.timelineBy==='read'?changeLayout(next,'timeline','read'):next;})});notify('又完成一次阅读，新的知识已留下。');};
  const createPdfNote=()=>{if(!reader||readerPaper?.type!=='paper')return '';const w=workspaceRef.current;const note={...newHandwrittenNote(reader,readerPaper.data.title.slice(0,40)+' · 阅读笔记'),fileId:readerPaper.data.fileId};applyWorkspace({...w,handwrittenNotes:[...w.handwrittenNotes,note]});return note.id;};
  const boardModeLabel=board.mode==='canvas'?'自由画布':board.mode==='timeline'?'时间轴':'知识图谱';
  return <div data-nav-side={navSide} style={{'--sidebar-width':`clamp(64px, ${navWidth}px, 35vw)`} as React.CSSProperties} onContextMenu={openWorkspaceMenu} className={`app-shell ${view==='board'&&!canvasChrome.sidebar?'sidebar-hidden':''} ${view==='board'&&!canvasChrome.topbar?'topbar-hidden':''}`} onDragEnter={e=>{if(e.dataTransfer.types.includes('Files')){e.preventDefault();dragDepth.current++;setDraggingFile(true);}}} onDragLeave={e=>{if(e.dataTransfer.types.includes('Files')){dragDepth.current--;if(dragDepth.current<=0){dragDepth.current=0;setDraggingFile(false);}}}} onDragOver={e=>{if(e.dataTransfer.types.includes('Files')){e.preventDefault();e.dataTransfer.dropEffect='copy';}}} onDrop={e=>{e.preventDefault();dragDepth.current=0;setDraggingFile(false);void importFiles(Array.from(e.dataTransfer.files),screenToFlowPosition({x:e.clientX,y:e.clientY}));}}>
    <input ref={fileInput} type="file" accept={ACCEPTED_FILES} multiple hidden aria-label="选择 PDF 文献" onChange={e=>void importFiles(Array.from(e.target.files||[]))}/>
    <aside className="sidebar"><SidebarControls label="导航侧栏" side={navSide} onSide={setNavSide} width={navWidth} onWidth={setNavWidth} min={166} max={360} reset={224}/><div className="sidebar-content"><a className="brand" href="#" onClick={e=>{e.preventDefault();setView('board');}} aria-label="Paperly 首页"><span className="brand-mark"><span/><span/><span/></span><span>Paperly<span className="brand-cn">纸间</span></span></a>
      <div className="workspace-switch"><span className="workspace-avatar">P<span/></span><span><b>我的研究空间</b><small>文献与笔记，本地保存</small></span><span className="local-pill">本地</span></div>
      <button className="sidebar-search" aria-label="搜索文献与笔记" title="搜索文献与笔记 (Ctrl+K)" onClick={()=>setDialog('search')}><Search size={15}/><span>搜索你的知识</span><kbd>Ctrl K</kbd></button>
      <nav className="main-nav">{([{id:'library',icon:BookOpen,label:'所有文献',count:allPapers.length},{id:'favorites',icon:Star,label:'我的收藏',count:allPapers.filter(n=>n.data.starred).length},{id:'recent',icon:History,label:'最近阅读'},{id:'handwriting',icon:PenLine,label:'手写笔记',count:workspace.handwrittenNotes.filter(note=>!note.deletedAt).length},{id:'conversations',icon:MessageSquare,label:'对话历史'}] as const).map(item=><button className={view===item.id?'active':''} key={item.id} aria-label={item.label} title={item.label} onClick={()=>{setView(item.id);setOpenedNoteId(null);setSelectedId(null);setSelectedEdgeId(null);}}><item.icon size={17}/><span>{item.label}</span>{'count' in item&&<small>{item.count}</small>}</button>)}</nav>
      <div className="sidebar-section-heading"><span>我的白板</span><button className="icon-button" title="新建白板" aria-label="新建白板" onClick={()=>setDialog('new')}><Plus size={15}/></button></div>
      <div className="board-list">{workspace.boards.map(b=><button className={`board-item ${view==='board'&&board.id===b.id?'active':''}`} key={b.id} aria-label={b.title} title={b.title} onClick={()=>activateBoard(b.id)}><span className={`board-indicator ${b.color}`}/><span>{b.title}</span><small>{b.nodes.filter(n=>n.type!=='section').length}</small></button>)}<button className="new-board-button" onClick={()=>setDialog('new')}><Plus size={15}/>新建白板</button></div>
      <div className="sidebar-bottom"><div className="research-progress"><div><span><BookOpen className="small-sun" size={13} aria-hidden="true"/>阅读进度</span><small>{completed}/{allPapers.length}</small></div><div className="progress-track"><span style={{width:`${allPapers.length?completed/allPapers.length*100:0}%`}}/></div><p>已读文献 / 全部文献</p></div><button className="sidebar-help" aria-label="使用指南与快捷键" title="使用指南与快捷键" onClick={()=>setDialog('help')}><CircleHelp size={16}/><span>使用指南与快捷键</span><Keyboard size={14}/></button><div className="profile"><span className="profile-avatar">研</span><span><b>我的本地资料库</b><small>文献、手写与知识连接</small></span><span className="online-dot"/></div></div>
    </div></aside>
    <main className="main-content"><header className="topbar"><div className="breadcrumb"><LayoutDashboard size={15}/><span>{view==='board'?'我的白板':view==='handwriting'?'手写笔记':view==='conversations'?'研究对话':'文献库'}</span><ChevronRight size={13}/><b>{view==='board'?board.title:view==='handwriting'?(openedNote?.title||'我的笔记库'):view==='library'?'所有文献':view==='favorites'?'我的收藏':view==='conversations'?'对话历史':'最近阅读'}</b></div><div className="topbar-right"><ThemeControl/><span className={`save-status ${saveState==='error'?'save-error':''}`}>{saveState==='saving'?<LoaderCircle className="spin" size={14}/>:saveState==='error'?<CircleHelp size={14}/>:<CircleCheck size={15}/>}<span>{saveState==='saving'?'正在保存':saveState==='error'?'保存失败':'已保存到本地'}</span></span><button className="icon-button" title="本地数据文件夹" aria-label="本地数据文件夹" onClick={()=>setDialog('storage')}><FileText size={16}/></button><div className="topbar-separator"/><button className="icon-button" title="使用指南" aria-label="使用指南" onClick={()=>setDialog('help')}><CircleHelp size={17}/></button><span className="topbar-avatar">P</span></div></header>
    {view==='board'?<><section className="board-header"><div><div className="board-title-row"><h1>{board.title}</h1><button className="icon-button board-settings" title="白板设置" aria-label="白板设置" onClick={()=>setDialog('settings')}><ChevronDown size={17}/></button><span className="board-private"><span/>私人白板</span></div><p>{board.description}</p></div><div className="board-header-actions"><button className="secondary-button export-button" onClick={exportBoard}><ArrowDownToLine size={14}/>导出白板</button><button className="primary-button" onClick={openImport} disabled={importing}>{importing?<LoaderCircle size={15} className="spin"/>:<Plus size={16}/>}导入文件</button></div></section>
      <div className="board-tabs-row"><div className="view-tabs">{allowedModes.map((mode,i)=>{const Icon=[Grid2X2,History,Network][i];return <button key={mode} className={board.mode===mode?'active':''} onClick={()=>setLayout(mode)}><Icon size={15}/>{['自由画布','时间轴','知识图谱'][i]}{board.mode===mode&&<span className="tab-dot"/>}</button>;})}</div><div className="board-tabs-actions"><button className="plain-button card-display-trigger" onClick={()=>setDialog('cards')} title="设置白板卡片默认显示内容和大小"><Settings2 size={14}/><span>卡片显示</span></button>{board.mode==='timeline'&&<select className="timeline-select" aria-label="时间轴排序方式" value={board.timelineBy||'year'} onChange={e=>{capture(true);mutate(b=>changeLayout(b,'timeline',e.target.value as 'year'|'read'),false);setTimeout(()=>fitView({...fitOptions,duration:400}),100);}}><option value="year">按发表年份</option><option value="read">按阅读 / 添加日期</option></select>}<div className="dropdown-wrap"><button aria-label="筛选文献" title="筛选文献" className={`plain-button ${statusFilter!=='all'?'filter-active':''}`} onClick={e=>{e.stopPropagation();setFilterOpen(v=>!v);setMenu(false);}}><Filter size={14}/><span>{statusFilter==='all'?'筛选':statusFilter==='read'?'已读':statusFilter==='reading'?'阅读中':'待读'}</span></button>{filterOpen&&<div className="dropdown filter-menu" onClick={e=>e.stopPropagation()}><span className="dropdown-caption">阅读状态</span>{[['all','全部文献'],['unread','待读'],['reading','阅读中'],['read','已读']].map(([value,label])=><button key={value} onClick={()=>{setStatusFilter(value);setFilterOpen(false);}}>{label}{statusFilter===value&&<Check size={14}/>}</button>)}</div>}</div><div className="dropdown-wrap"><button className="icon-button" title="更多白板操作" aria-label="更多白板操作" onClick={e=>{e.stopPropagation();setMenu(v=>!v);setFilterOpen(false);}}><Ellipsis size={18}/></button>{menu&&<div className="dropdown" onClick={e=>e.stopPropagation()}><button onClick={()=>{setDialog('settings');setMenu(false);}}><Settings2 size={15}/>白板设置</button><button onClick={exportBoard}><ArrowDownToLine size={15}/>导出白板结构</button><button onClick={()=>{void fitView({...fitOptions,duration:450});setMenu(false);}}><Maximize size={15}/>显示全部内容</button><div className="dropdown-divider"/><button className="danger-text" onClick={()=>{setMenu(false);setDialog('delete');}}>删除当前白板</button></div>}</div></div></div>
      <div className="canvas-and-inspector"><div ref={flowContainer} className={`canvas-container ${tool==='connect'?'connect-mode':''} ${tool==='hand'?'hand-mode':''} ${board.mode==='timeline'?'timeline-mode':''}`} style={{'--canvas-zoom':viewport.zoom} as React.CSSProperties}>
      <NodeActions.Provider value={nodeActions}><ReactFlow<AppNode,AppEdge> colorMode={theme} nodes={visibleNodes} edges={board.edges} nodeTypes={nodeTypes} onNodesChange={onNodesChange} onEdgesChange={onEdgesChange} onConnect={onConnect} onNodeDragStart={()=>{nodeDragging.current=true;capture(true);}} onNodeDragStop={()=>{nodeDragging.current=false;mutate(b=>({...b}),false);}} onNodeClick={(event,node)=>{if(openedNote&&notePresentation==='split')return;if(node.type==='section'||(event.target as HTMLElement).closest('.react-flow__handle'))return;setSelectedId(node.id);setSelectedEdgeId(null);setAppearanceTab(false);}} onEdgeClick={(_,edge)=>{setSelectedId(null);setSelectedEdgeId(edge.id);}} onPaneContextMenu={openCanvasMenu} onNodeContextMenu={openCardMenu} onEdgeContextMenu={openEdgeMenu} onPaneClick={closeInspector} onDoubleClick={e=>{if((e.target as HTMLElement).classList.contains('react-flow__pane'))addNote(screenToFlowPosition({x:e.clientX,y:e.clientY}));}} onMoveStart={onMoveStart} onMove={onMove} onMoveEnd={onMoveEnd} fitView fitViewOptions={fitOptions} minZoom={.15} maxZoom={2} snapToGrid={snap} snapGrid={snapGrid} connectionMode={ConnectionMode.Loose} isValidConnection={connection=>connection.source!==connection.target} nodesDraggable={tool!=='hand'&&board.mode!=='timeline'} nodesConnectable={tool!=='hand'} panOnDrag={tool==='hand'?[0,1]:[1]} selectionOnDrag={tool==='select'} panOnScroll zoomOnScroll={false} zoomOnPinch zoomOnDoubleClick={false} panActivationKeyCode="Space" deleteKeyCode={null} connectionRadius={28} connectOnClick preventScrolling defaultEdgeOptions={{interactionWidth:20}}><Background variant={BackgroundVariant.Dots} color={theme==='dark'?'#344456':'#c3d2de'} gap={24} size={1.05}/>{showMap&&board.nodes.some(n=>n.type!=='section')&&<MiniMap className="paperly-minimap" nodeColor={n=>n.type==='text'?(theme==='dark'?'#786b3f':'#e6d99f'):(theme==='dark'?'#4b7288':'#a8c4d3')} nodeStrokeColor={theme==='dark'?'#6994a8':'#8aabbf'} maskColor={theme==='dark'?'rgba(12,20,29,.72)':'rgba(240,245,249,.72)'} nodeBorderRadius={5} pannable zoomable ariaLabel="画布缩略导航"/>}</ReactFlow></NodeActions.Provider>
      <div className="canvas-info"><span className="live-dot"/>{papers.length} 个文件<span>·</span>{totalNotes} 条灵感<span>·</span>{board.edges.length} 个连接</div>
      <div className="canvas-top-right"><CanvasChromeControls chrome={canvasChrome} onChange={setCanvasChrome} onFocus={toggleCanvasFocus}/><button className={`canvas-small-button ${snap?'enabled':''}`} title={snap?'已开启网格吸附':'开启网格吸附'} aria-label="切换网格吸附" onClick={()=>{setSnap(v=>!v);notify(snap?'已关闭网格吸附':'已开启网格吸附');}}><Magnet size={14}/><span>吸附</span><span className="toggle-track"><i/></span></button></div>
      <FloatingToolbar label="白板工具栏" storageKey="canvas-toolbar" className="canvas-toolbar"><div className="canvas-tools"><button className={tool==='select'?'active':''} title="选择工具 (V)" aria-label="选择工具" onClick={()=>setTool('select')}><MousePointer2 size={18}/></button><button className={tool==='hand'?'active':''} title="抓手工具 (H)" aria-label="抓手工具" onClick={()=>setTool('hand')}><Hand size={18}/></button><i/><button title="添加灵感笔记 (N)" aria-label="添加灵感笔记" className="note-tool" onClick={()=>addNote()}><StickyNote size={19}/></button><button className={tool==='connect'?'active':''} title="连接卡片" aria-label="连接卡片" onClick={()=>{setTool(t=>t==='connect'?'select':'connect');notify('从卡片边缘的圆点拖向另一张卡片，建立关系。');}}><Link2 size={18}/></button><button title="导入文件" aria-label="导入文件" onClick={openImport}><FilePlus2 size={18}/></button><i/><button title="撤销 (Ctrl+Z)" aria-label="撤销" disabled={!history.current.past.length} onClick={undo}><Undo2 size={17}/></button><button title="重做 (Ctrl+Shift+Z)" aria-label="重做" disabled={!history.current.future.length} onClick={redo}><Redo2 size={17}/></button></div></FloatingToolbar>
      {!board.nodes.some(n=>n.type!=='section')&&<div className="canvas-empty"><div className="empty-cards"><FileText size={32}/><StickyNote size={30}/></div><h2>让第一个文件，成为起点。</h2><p>把 PDF、Word、PPT 或图片拖到这里，或留下一条灵感。<br/>你的知识版图，将从这里生长。</p><button className="primary-button" onClick={openImport}><Plus size={16}/>导入第一个文件</button><button className="plain-button" onClick={()=>addNote()}>先写点什么<ArrowRight size={14}/></button></div>}
      {statusFilter!=='all'&&!visibleNodes.some(n=>n.type==='paper'&&!n.hidden)&&<div className="filter-empty">没有符合当前状态的文献<button className="plain-button" onClick={()=>setStatusFilter('all')}>清除筛选</button></div>}
      <div className="canvas-bottom-left"><button className={`icon-button ${showMap?'map-active':''}`} title="切换缩略图" aria-label="切换缩略图" onClick={()=>setShowMap(v=>!v)}><Map size={16}/></button><span>空格 + 拖动平移<span className="hint-separator">·</span>双击留下灵感</span></div><div className="canvas-zoom"><button title="缩小" aria-label="缩小" onClick={()=>void zoomOut({duration:220})}><Minus size={15}/></button><button className="zoom-value" title="重置为 100%" onClick={()=>void setViewport({...getViewport(),zoom:1},{duration:300})}>{Math.round(viewport.zoom*100)}<small>%</small></button><button title="放大" aria-label="放大" onClick={()=>void zoomIn({duration:220})}><Plus size={15}/></button><i/><button title="适应全部内容 (F)" aria-label="适应全部内容" onClick={()=>void fitView({...fitOptions,duration:450})}><Focus size={17}/></button></div>
      </div>{!(openedNote&&notePresentation==='split')&&(selectedNode||selectedEdge)&&<Inspector node={selectedNode} edge={selectedEdge} nodes={board.nodes} appearanceTab={appearanceTab} onAppearanceTab={setAppearanceTab} cardDefaults={board.cardDefaults} onAppearance={patch=>{if(selectedId)updateCardAppearance(selectedId,patch);}} onResetAppearance={()=>{if(selectedId)updateCardAppearance(selectedId);}} onResizeStart={beginCardResize} onResizeEnd={endCardResize} onClose={closeInspector} update={updateSelected} updateEdge={edge=>mutate(b=>({...b,edges:b.edges.map(e=>e.id===edge.id?edge:e)}))} remove={removeSelected} open={()=>{if(selectedId)setReader({boardId:board.id,nodeId:selectedId});}}/>}{openedNote&&notePresentation==='split'&&<div className="ink-split-pane dockable-note-pane" style={{width:boardNoteWidth,order:boardNoteSide==='left'?0:2}}><SidebarControls label="白板笔记侧栏" side={boardNoteSide} onSide={setBoardNoteSide} width={boardNoteWidth} onWidth={setBoardNoteWidth} min={320} max={900} reset={480}/>{renderInkEditor(true)}</div>}</div>
      <footer className="app-statusbar"><span><span className="tiny-dot"/> 文献、灵感与笔记，连接在这里</span><span>{boardModeLabel}<span className="statusbar-divider">/</span>本地优先，专注思考 <span className="version-badge">BETA</span></span></footer>
    </>:view==='handwriting'?(openedNote?renderInkEditor():<HandwritingLibrary workspace={workspace} onCreate={theme=>createHandwritten(null,theme)} onOpen={openHandwritten} onRename={(id,title)=>updateHandwritten(id,{title})} onDelete={trashHandwritten} onRestore={id=>{updateHandwritten(id,{deletedAt:undefined});notify('笔记已恢复。');}} onLocate={locateFromNote}/>):view==='conversations'?<ConversationHistory workspace={workspace} selectedId={selectedConversationId} onSelect={setSelectedConversationId} onOpenSource={anchor=>setReader(anchor)} onSaveNote={saveAiNote}/>:<Library boards={workspace.boards} view={view} onOpen={(boardId,id)=>setReader({boardId,nodeId:id})} onLocate={locate} onStar={toggleStar} onImport={openImport}/>}</main>
    {cardNotesAnchor&&<CardNotesDialog workspace={workspace} anchor={cardNotesAnchor} onClose={()=>setCardNotesAnchor(null)} onOpen={openHandwritten} onCreate={()=>createHandwritten(cardNotesAnchor,'light',true)} onBind={id=>{updateHandwritten(id,{anchor:cardNotesAnchor});notify('已建立双向关联。');}}/>}
    {bindingNote&&<LinkNoteDialog workspace={workspace} note={bindingNote} onClose={()=>setBindingNoteId(null)} onBind={anchor=>{updateHandwritten(bindingNote.id,{anchor});setBindingNoteId(null);notify(anchor?'已建立双向关联，可从卡片查看这份笔记。':'已解除关联，笔记内容完整保留。');}}/>}
    {draggingFile&&<div className="drop-overlay"><div><div className="drop-icon"><Upload size={34}/></div><h2>松开鼠标，让知识落在这里。</h2><p>文件将生成独立卡片，保存在本地数据文件夹。</p><span className="drop-file-pill"><FileText size={14}/>PDF · Word · PPT · JPG/PNG</span></div></div>}
    {importing&&<div className="import-progress"><LoaderCircle className="spin" size={18}/><div><b>正在整理你的文献</b><span>保存原件、生成文件卡片…</span></div></div>}
    {toast&&<div className="toast" key={toast.id} role="status"><span className="toast-check"><Check size={13}/></span><span>{toast.text}</span>{toast.undo&&<button onClick={()=>{undo();setToast(null);}}>撤销</button>}<button className="icon-button" title="关闭提示" aria-label="关闭提示" onClick={()=>setToast(null)}><X size={14}/></button></div>}
    {(dialog==='new'||dialog==='settings')&&<BoardDialog initial={dialog==='settings'?board:undefined} onClose={()=>setDialog(null)} onSubmit={(title,description)=>{if(dialog==='settings')mutate(b=>({...b,title,description}));else{const id=uid();const w=workspaceRef.current;applyWorkspace({...w,activeBoardId:id,boards:[...w.boards,{id,title,description,color:['green','purple','orange'][w.boards.length%3],nodes:[],edges:[],mode:'canvas',updatedAt:now()}]});history.current={past:[],future:[],last:0};setView('board');setSelectedId(null);setSelectedEdgeId(null);}setDialog(null);notify(dialog==='settings'?'白板设置已保存。':'新的知识空间，已准备就绪。');}}/>}
    {dialog==='search'&&<SearchDialog boards={workspace.boards} onClose={()=>setDialog(null)} onSelect={locate}/>}{dialog==='help'&&<HelpDialog onClose={()=>setDialog(null)}/>}
    {dialog==='cards'&&<Modal title="白板卡片默认设置" onClose={()=>setDialog(null)} className="card-defaults-modal"><CardAppearanceSettings value={board.cardDefaults} kind="all" isDefault onChange={updateCardDefaults} onReset={()=>updateCardDefaults()} onStart={beginCardResize} onEnd={endCardResize}/><div className="card-defaults-footer"><p>单张卡片可在右侧「卡片显示」中单独调整。</p><button className="plain-button" onClick={()=>{mutate(b=>({...b,nodes:b.nodes.map(n=>n.type==='section'?n:{...n,data:{...n.data,appearance:undefined}} as AppNode)}));notify('所有卡片已恢复跟随白板默认设置，可撤销。',true);}}>让所有卡片使用默认设置</button></div></Modal>}
    {dialog==='storage'&&<Modal title="本地数据文件夹" onClose={()=>setDialog(null)}><div className="confirm-body storage-info"><p>工作区、文件与手写笔记保存在电脑上，无需登录。</p><code>{dataDirectory||'正在读取…'}</code><p>workspace.json 保存白板；notes 保存手写笔记；papers 保存原件、编辑稿与批注；conversations 保存本平台 AI 对话。ai-auth 包含账号凭证，请妥善保管备份。</p><div className="modal-actions"><button className="primary-button" onClick={()=>void openDataFolder().catch(e=>notify(e.message))}>打开数据文件夹</button></div></div></Modal>}
    {!hydrated&&<Modal title={loadError?'无法连接本地资料库':'正在打开本地资料库'} onClose={()=>{}}><div className="confirm-body"><p>{loadError||'正在读取文件夹，并迁移原有浏览器数据…'}</p>{loadError&&<><p>请在项目目录运行 npm run dev，确认本地后端正在运行。</p><div className="modal-actions"><button className="primary-button" onClick={()=>setLoadAttempt(v=>v+1)}>重新连接</button></div></>}</div></Modal>}
    {dialog==='delete'&&<Modal title="删除这片知识空间？" onClose={()=>setDialog(null)}><div className="confirm-body"><p>「{board.title}」及其中的 {papers.length} 张文件卡片、{totalNotes} 条笔记和 {board.edges.length} 条连接将从白板列表移除。</p><p className="muted">这不会删除你电脑上的原文件。此操作无法撤销，可先导出白板结构。</p><div className="modal-actions"><button className="secondary-button" onClick={()=>setDialog(null)}>保留白板</button><button className="danger-button" onClick={()=>{const w=workspaceRef.current;let boards=w.boards.filter(b=>b.id!==board.id);if(!boards.length)boards=[{id:uid(),title:'新的知识空间',description:'每一个想法，都值得被连接。',color:'green',nodes:[],edges:[],mode:'canvas',updatedAt:now()}];applyWorkspace({...w,boards,activeBoardId:boards[0].id});setSelectedId(null);setSelectedEdgeId(null);history.current={past:[],future:[],last:0};setDialog(null);notify('白板已删除。');}}>删除白板</button></div></div></Modal>}
    {readerPaper?.type==='paper'&&(readerPaper.data.fileId&&reader?<FileReader key={readerPaper.data.fileId} paper={readerPaper.data} anchor={reader} workspace={workspace} saveState={saveState} onClose={()=>setReader(null)} onRead={markReaderRead} onCreateNote={createPdfNote} onUpdateNote={updateHandwritten} onSaveAiNote={saveAiNote} onBindNote={id=>updateHandwritten(id,{anchor:reader,fileId:readerPaper.data.fileId})} onUpdate={patch=>{const w=workspaceRef.current;applyWorkspace({...w,boards:w.boards.map(b=>b.id===reader.boardId?{...b,nodes:b.nodes.map(n=>n.id===reader.nodeId&&n.type==='paper'?{...n,data:{...n.data,...patch}}:n),updatedAt:now()}:b)});}}/>:<Reader paper={readerPaper.data} onClose={()=>setReader(null)} onRead={markReaderRead}/>)}
  </div>;
}
