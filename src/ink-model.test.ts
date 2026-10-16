import { describe, expect, it } from 'vitest';
import { initialWorkspace } from './seed';
import { inkBounds, newHandwrittenNote, pointSegmentDistance, pressureValue, reconcileAnchors, restoreBoard, snapshotBoard, strokeHit, strokeOutline, toInkPoint } from './ink-model';
import type { InkStroke } from './types';

const stroke: InkStroke={id:'stroke',color:'#263a32',width:4,tool:'pen',pressure:true,simulatePressure:false,points:[{x:0,y:0,pressure:.1},{x:100,y:0,pressure:1}]};
describe('handwriting geometry and pressure',()=>{
  it('maps tablet coordinates through pan and zoom without losing pressure',()=>{
    expect(toInkPoint(140,100,.8,{x:20,y:40,zoom:2})).toEqual({x:60,y:30,pressure:.8});
    expect(pressureValue(5,'pen')).toBe(1);expect(pressureValue(NaN,'pen')).toBe(.5);expect(pressureValue(0,'mouse')).toBe(.5);
  });
  it('erases the middle of a long segment even without a sampled point there',()=>{
    const point={x:50,y:3,pressure:.5};expect(strokeHit(stroke,point,5)).toBe(true);expect(strokeHit(stroke,{...point,y:40},5)).toBe(false);
    expect(pointSegmentDistance(point,stroke.points[0],stroke.points[1])).toBe(3);
  });
  it('handles single-point dots and negative-coordinate drawings',()=>{
    expect(strokeHit({...stroke,points:[{x:-50,y:-20,pressure:1}]},{x:-48,y:-20,pressure:1},3)).toBe(true);
    const bounds=inkBounds([{...stroke,points:[{x:-50,y:-20,pressure:1},{x:-10,y:10,pressure:1}]}]);
    expect(bounds.x).toBeLessThan(-50);expect(bounds.width).toBeGreaterThan(40);expect(bounds.height).toBeGreaterThan(30);
  });
  it('produces different pressure-sensitive outlines and supports tap strokes',()=>{
    const light=strokeOutline({...stroke,points:stroke.points.map(p=>({...p,pressure:.1}))});
    const heavy=strokeOutline({...stroke,points:stroke.points.map(p=>({...p,pressure:1}))});
    expect(light).not.toEqual(heavy);expect(strokeOutline({...stroke,points:[stroke.points[0]]}).length).toBeGreaterThan(0);
  });
});
describe('cross-page links and migration',()=>{
  it('adds the note collection when loading an old workspace without changing its boards',()=>{
    const workspace=initialWorkspace();const {handwrittenNotes:_,...old}=workspace;
    const upgraded=reconcileAnchors(old as typeof workspace);expect(upgraded.handwrittenNotes).toEqual([]);expect(upgraded.boards).toBe(old.boards);
  });
  it('allows many notes on one card and detaches a missing anchor while preserving ink',()=>{
    const workspace=initialWorkspace();const anchor={boardId:'llm-research',nodeId:'attention'};
    workspace.handwrittenNotes=[newHandwrittenNote(anchor),newHandwrittenNote(anchor)];workspace.handwrittenNotes[0].strokes=[stroke];
    expect(reconcileAnchors(workspace).handwrittenNotes.every(n=>n.anchor?.nodeId==='attention')).toBe(true);
    const deleted={...workspace,boards:workspace.boards.map(b=>({...b,nodes:b.nodes.filter(n=>n.id!=='attention')}))};
    expect(reconcileAnchors(deleted).handwrittenNotes.every(n=>n.anchor===null)).toBe(true);
    expect(reconcileAnchors(deleted).handwrittenNotes[0].strokes).toEqual([stroke]);
  });
  it('restores card bindings on undo without overwriting newer handwritten content',()=>{
    const workspace=initialWorkspace();workspace.handwrittenNotes=[newHandwrittenNote({boardId:'llm-research',nodeId:'attention'})];const snapshot=snapshotBoard(workspace);
    const removed=reconcileAnchors({...workspace,boards:workspace.boards.map(b=>({...b,nodes:b.nodes.filter(n=>n.id!=='attention')}))});
    removed.handwrittenNotes[0]={...removed.handwrittenNotes[0],title:'A newer title',strokes:[stroke]};
    const restored=restoreBoard(removed,snapshot);expect(restored.handwrittenNotes[0].anchor?.nodeId).toBe('attention');expect(restored.handwrittenNotes[0].title).toBe('A newer title');expect(restored.handwrittenNotes[0].strokes).toEqual([stroke]);
  });
  it('does not rebind a deliberately unlinked note when undoing a card movement',()=>{
    const workspace=initialWorkspace();workspace.handwrittenNotes=[newHandwrittenNote({boardId:'llm-research',nodeId:'attention'})];const snapshot=snapshotBoard(workspace);
    const unlinked={...workspace,handwrittenNotes:workspace.handwrittenNotes.map(note=>({...note,anchor:null}))};
    expect(restoreBoard(unlinked,snapshot).handwrittenNotes[0].anchor).toBeNull();
  });
});
