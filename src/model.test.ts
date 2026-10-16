import { describe, expect, it } from 'vitest';
import { changeLayout, isWorkspace, makeEdge, removeNodes, safeFilename } from './model';
import { initialWorkspace } from './seed';

describe('whiteboard data integrity',()=>{
  it('restores the exact free canvas positions after timeline and graph layouts',()=>{
    const board=initialWorkspace().boards[0];
    const positions=Object.fromEntries(board.nodes.map(n=>[n.id,n.position]));
    const timeline=changeLayout(board,'timeline');
    expect(timeline.nodes.filter(n=>n.type==='paper').every(n=>!n.draggable)).toBe(true);
    const graph=changeLayout(timeline,'graph');
    const restored=changeLayout(graph,'canvas');
    expect(Object.fromEntries(restored.nodes.map(n=>[n.id,n.position]))).toEqual(positions);
    expect(restored.nodes.every(n=>!n.hidden)).toBe(true);
    expect(restored.edges).toEqual(board.edges);
  });
  it('places papers of the same year in distinct vertical slots',()=>{
    const timeline=changeLayout(initialWorkspace().boards[0],'timeline');
    const sameYear=timeline.nodes.filter(n=>n.type==='paper'&&n.data.year===2020);
    expect(sameYear).toHaveLength(2);
    expect(sameYear[0].position.x).toBe(sameYear[1].position.x);
    expect(Math.abs(sameYear[0].position.y-sameYear[1].position.y)).toBeGreaterThanOrEqual(360);
  });
  it('removes all dangling edges when a paper is deleted',()=>{
    const board=initialWorkspace().boards[0];
    const next=removeNodes(board,['attention','gpt3']);
    expect(next.nodes.some(n=>n.id==='attention'||n.id==='gpt3')).toBe(false);
    expect(next.edges.every(e=>next.nodes.some(n=>n.id===e.source)&&next.nodes.some(n=>n.id===e.target))).toBe(true);
    expect(board.nodes).toHaveLength(9);
  });
  it('supports directed and undirected relations',()=>{
    const directed=makeEdge('a','b','引用',true);
    const undirected=makeEdge('b','c','相关',false);
    expect(directed.markerEnd).toBeDefined();
    expect(undirected.markerEnd).toBeUndefined();
    expect(undirected.data?.directed).toBe(false);
  });
  it('rejects malformed persisted workspaces',()=>{
    expect(isWorkspace(initialWorkspace())).toBe(true);
    expect(isWorkspace(null)).toBe(false);
    expect(isWorkspace({version:1,activeBoardId:'a',boards:[]})).toBe(false);
    expect(isWorkspace({version:1,activeBoardId:'a',boards:[{id:'a',title:'test',nodes:null,edges:[]}]})).toBe(false);
  });
  it('makes exported names usable on Windows',()=>{
    expect(safeFilename('研究: RAG/LLM?')).toBe('研究_ RAG_LLM_');
    expect(safeFilename(' ')).toBe('未命名白板');
  });
});
