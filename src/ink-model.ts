import { getStroke } from 'perfect-freehand';
import type { BoardSnapshot, HandwrittenNote, InkPoint, InkStroke, InkTheme, NoteAnchor, Workspace } from './types';
import { now, uid } from './model';

export const INK_THEMES: Record<InkTheme, {name: string; background: string; foreground: string; colors: string[]}> = {
  light: {name:'纯白',background:'#ffffff',foreground:'#263a32',colors:['#263a32','#527c65','#c8755e','#b49a42','#7088b2','#a881ac']},
  dark: {name:'纯黑',background:'#000000',foreground:'#f0f0e7',colors:['#f0f0e7','#a7cfa5','#e6a78d','#e5cf83','#a6bce8','#c5a5d4']},
  green: {name:'黑板绿',background:'#123c2d',foreground:'#f0f0d8',colors:['#f0f0d8','#b9d2a3','#e3ae91','#e9d88e','#b2c9e3','#d7bedb']},
};

export function newHandwrittenNote(anchor: NoteAnchor | null = null, title = '未命名笔记'): HandwrittenNote {
  return {id:uid(),title,theme:'light',strokes:[],anchor,createdAt:now(),updatedAt:now()};
}
export function reconcileAnchors(workspace: Workspace): Workspace {
  const anchors=new Set(workspace.boards.flatMap(b=>b.nodes.filter(n=>n.type!=='section').map(n=>`${b.id}/${n.id}`)));
  const notes=workspace.handwrittenNotes||[];
  let changed=!workspace.handwrittenNotes;
  const next=notes.map(n=>{if(n.anchor&&!anchors.has(`${n.anchor.boardId}/${n.anchor.nodeId}`)){changed=true;return {...n,anchor:null};}const target=anchorDetails(workspace,n.anchor);const fileId=target?.node.type==='paper'?target.node.data.fileId:undefined;if(fileId&&fileId!==n.fileId){changed=true;return {...n,fileId};}return n;});
  return changed?{...workspace,handwrittenNotes:next}:workspace;
}
export function snapshotBoard(workspace: Workspace): BoardSnapshot {
  return {board:structuredClone(workspace.boards.find(b=>b.id===workspace.activeBoardId)!),anchors:Object.fromEntries(workspace.handwrittenNotes.map(n=>[n.id,n.anchor]))};
}
export function restoreBoard(workspace: Workspace, snapshot: BoardSnapshot): Workspace {
  const existing=new Set(workspace.boards.find(b=>b.id===snapshot.board.id)?.nodes.map(n=>n.id)||[]);
  const revived=new Set(snapshot.board.nodes.filter(n=>!existing.has(n.id)).map(n=>n.id));
  return reconcileAnchors({...workspace,boards:workspace.boards.map(b=>b.id===snapshot.board.id?snapshot.board:b),handwrittenNotes:workspace.handwrittenNotes.map(note=>{const anchor=snapshot.anchors[note.id];return !note.anchor&&anchor&&anchor.boardId===snapshot.board.id&&revived.has(anchor.nodeId)?{...note,anchor}:note;})});
}
export function pressureValue(value: number, pointerType: string): number {
  if(pointerType!=='pen')return .5;
  return Number.isFinite(value)?Math.min(1,Math.max(.01,value)):.5;
}
export function toInkPoint(x: number,y: number,pressure: number,viewport: {x:number;y:number;zoom:number}): InkPoint {
  return {x:(x-viewport.x)/viewport.zoom,y:(y-viewport.y)/viewport.zoom,pressure};
}
export function strokeOutline(stroke: InkStroke, complete=true): number[][] {
  return getStroke(stroke.points,{size:stroke.width,thinning:stroke.pressure?.6:0,smoothing:.65,streamline:.22,simulatePressure:stroke.simulatePressure,last:complete});
}
export function outlinePath(points: number[][]): string {
  if(!points.length)return '';
  let path=`M ${points[0][0]} ${points[0][1]} Q`;
  for(let i=0;i<points.length;i++){const next=points[(i+1)%points.length];path+=` ${points[i][0]} ${points[i][1]} ${(points[i][0]+next[0])/2} ${(points[i][1]+next[1])/2}`;}
  return path+' Z';
}
export function drawStroke(context: CanvasRenderingContext2D,stroke: InkStroke,complete=true): void {
  const outline=strokeOutline(stroke,complete);if(!outline.length)return;
  context.save();context.fillStyle=stroke.color;context.globalAlpha=stroke.tool==='highlighter'?.3:1;
  context.beginPath();context.moveTo(outline[0][0],outline[0][1]);
  for(let i=0;i<outline.length;i++){const p=outline[i],next=outline[(i+1)%outline.length];context.quadraticCurveTo(p[0],p[1],(p[0]+next[0])/2,(p[1]+next[1])/2);}
  context.closePath();context.fill();context.restore();
}
export function pointSegmentDistance(point: InkPoint,a: InkPoint,b: InkPoint): number {
  const dx=b.x-a.x,dy=b.y-a.y;
  const t=dx*dx+dy*dy===0?0:Math.max(0,Math.min(1,((point.x-a.x)*dx+(point.y-a.y)*dy)/(dx*dx+dy*dy)));
  return Math.hypot(point.x-a.x-t*dx,point.y-a.y-t*dy);
}
export function strokeBounds(stroke: InkStroke): {x:number;y:number;width:number;height:number} {
  if(!stroke.points.length)return {x:0,y:0,width:0,height:0};
  let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
  for(const p of stroke.points){minX=Math.min(minX,p.x);minY=Math.min(minY,p.y);maxX=Math.max(maxX,p.x);maxY=Math.max(maxY,p.y);}
  return {x:minX-stroke.width,y:minY-stroke.width,width:maxX-minX+stroke.width*2,height:maxY-minY+stroke.width*2};
}
export function inkBounds(strokes: InkStroke[]): {x:number;y:number;width:number;height:number} {
  if(!strokes.length)return {x:0,y:0,width:800,height:500};
  const bounds=strokes.map(strokeBounds);const x=Math.min(...bounds.map(b=>b.x)),y=Math.min(...bounds.map(b=>b.y));
  return {x,y,width:Math.max(1,...bounds.map(b=>b.x+b.width-x)),height:Math.max(1,...bounds.map(b=>b.y+b.height-y))};
}
export function strokeHit(stroke: InkStroke,point: InkPoint,radius: number,bounds=strokeBounds(stroke)): boolean {
  if(point.x<bounds.x-radius||point.x>bounds.x+bounds.width+radius||point.y<bounds.y-radius||point.y>bounds.y+bounds.height+radius)return false;
  const distance=radius+stroke.width*.8;
  if(stroke.points.length===1)return Math.hypot(point.x-stroke.points[0].x,point.y-stroke.points[0].y)<=distance;
  for(let i=1;i<stroke.points.length;i++)if(pointSegmentDistance(point,stroke.points[i-1],stroke.points[i])<=distance)return true;
  return false;
}
export function anchorDetails(workspace: Pick<Workspace,'boards'>,anchor: NoteAnchor|null){
  const board=anchor?workspace.boards.find(b=>b.id===anchor.boardId):undefined;
  const node=board?.nodes.find(n=>n.id===anchor?.nodeId&&n.type!=='section');
  return node&&board?{board,node}:null;
}
