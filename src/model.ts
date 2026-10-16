import { MarkerType } from '@xyflow/react';
import type { AppNode, AppEdge, Board, LayoutMode, PaperNode, Workspace } from './types';
import { cardFootprint } from './card-model';
import { compareAssets,timelineGroup } from './asset-model';

export const uid = () => crypto.randomUUID();
export const now = () => new Date().toISOString();
export const paperNodes = (nodes: AppNode[]): PaperNode[] => nodes.filter((n): n is PaperNode => n.type === 'paper');
export function makeEdge(source: string, target: string, relation = '关联', directed = true): AppEdge {
  return {id:uid(),source,target,sourceHandle:'right',targetHandle:'left',type:'default',label:relation,
    data:{relation,directed},markerEnd:directed ? {type:MarkerType.ArrowClosed,width:15,height:15,color:'#7b9d8a'} : undefined,
    style:{stroke:'#8ba593',strokeWidth:1.6},labelStyle:{fill:'#738075',fontSize:10},labelBgStyle:{fill:'#f6f7f2',fillOpacity:.96},labelBgPadding:[7,4],labelBgBorderRadius:4};
}
export function changeLayout(board: Board, mode: LayoutMode, timelineBy: 'year' | 'read' = board.timelineBy || 'year'): Board {
  let freePositions = board.freePositions;
  if(board.mode === 'canvas') freePositions = Object.fromEntries(board.nodes.map(n=>[n.id,n.position]));
  const nodes = board.nodes.filter(n=>n.type!=='section');
  if (mode === 'canvas') return {...board,mode,freePositions,timelineBy,nodes:board.nodes.map(n=>({...n,hidden:false,draggable:n.type!=='section',position:freePositions?.[n.id]||n.position}))};
  const papers = paperNodes(nodes).sort((a,b)=>compareAssets(a.data,b.data,timelineBy));
  const other = nodes.filter(n=>n.type==='text');
  const places: Record<string,{x:number;y:number}> = {};
  if(mode === 'timeline') {
    const groups = [...new Set(papers.map(n=>timelineGroup(n.data,timelineBy)))];
    let columnX=0,bottom=440;
    for(const group of groups){const members=papers.filter(n=>timelineGroup(n.data,timelineBy)===group);let rowY=80,columnWidth=340;for(const n of members){const size=cardFootprint(n,board.cardDefaults);places[n.id]={x:columnX,y:rowY};rowY+=Math.max(360,size.height+55);columnWidth=Math.max(columnWidth,size.width+60);}bottom=Math.max(bottom,rowY);columnX+=columnWidth;}
    let textX=0;other.forEach(n=>{places[n.id]={x:textX,y:bottom+70};textX+=Math.max(330,cardFootprint(n,board.cardDefaults).width+55);});
  } else {
    // Stable circular layout keeps every paper available, including isolated nodes.
    const radius = Math.max(390, papers.length * 62);
    papers.forEach((n,i)=>{const angle=(i/Math.max(papers.length,1))*Math.PI*2-Math.PI/2;places[n.id]={x:radius+Math.cos(angle)*radius,y:radius+Math.sin(angle)*radius*.8};});
    other.forEach((n,i)=>{places[n.id]={x:radius-5+i*320,y:radius+20};});
  }
  return {...board,mode,freePositions,timelineBy,nodes:board.nodes.map(n=>({...n,hidden:n.type==='section',draggable:mode!=='timeline'&&n.type!=='section',position:places[n.id]||n.position}))};
}
export function removeNodes(board: Board, ids: string[]): Board {
  const removing = new Set(ids);
  return {...board,nodes:board.nodes.filter(n=>!removing.has(n.id)),edges:board.edges.filter(e=>!removing.has(e.source)&&!removing.has(e.target))};
}
export function isWorkspace(value: unknown): value is Workspace {
  if(!value||typeof value!=='object') return false;
  const w=value as Workspace;
  return w.version===1 && typeof w.activeBoardId==='string' && Array.isArray(w.boards) && w.boards.length>0 && w.boards.every(b=>typeof b.id==='string'&&typeof b.title==='string'&&Array.isArray(b.nodes)&&Array.isArray(b.edges));
}
export function safeFilename(name: string) {return name.replace(/[<>:"/\\|?*\u0000-\u001f]/g,'_').trim()||'未命名白板';}
