import { describe,expect,it } from 'vitest';
import { initialWorkspace } from './seed';
import { changeLayout } from './model';
import { patchCardAppearance,resolveCardAppearance } from './card-model';
import { restoreBoard,snapshotBoard } from './ink-model';
import type { AppNode } from './types';

describe('canvas card appearance',()=>{
  it('keeps legacy cards visible and layers per-card choices over board defaults',()=>{
    expect(resolveCardAppearance().fields).toMatchObject({authors:true,tags:true,preview:true,abstract:false});
    const board={fields:{authors:false,preview:false},scale:1.25};
    const own={fields:{authors:true,tags:false}};
    expect(resolveCardAppearance(own,board)).toMatchObject({scale:1.25,fields:{authors:true,tags:false,preview:false,year:true}});
    expect(resolveCardAppearance(undefined,board).fields.authors).toBe(false);
    expect(resolveCardAppearance({scale:.8},board).scale).toBe(.8);
  });
  it('retains independent field choices when later changing scale or another field',()=>{
    const original={fields:{authors:false,tags:false},scale:.8};
    const next=patchCardAppearance(original,{fields:{preview:false}});
    expect(resolveCardAppearance(patchCardAppearance(next,{scale:1.6}))).toMatchObject({scale:1.6,fields:{authors:false,tags:false,preview:false}});
    expect(original).toEqual({fields:{authors:false,tags:false},scale:.8});
    expect(resolveCardAppearance({scale:100}).scale).toBe(2);
    expect(resolveCardAppearance({scale:-1}).scale).toBe(.6);
    expect(resolveCardAppearance({scale:NaN}).scale).toBe(1);
  });
  it('spaces enlarged timeline cards and keeps their free-canvas positions and relations',()=>{
    const original=initialWorkspace().boards[0];
    const board={...original,nodes:original.nodes.map(n=>n.type==='paper'?{...n,data:{...n.data,appearance:{scale:2}},measured:{width:556,height:650}} as AppNode:n)};
    const timeline=changeLayout(board,'timeline');
    const papers=timeline.nodes.filter(n=>n.type==='paper');
    for(const a of papers)for(const b of papers){if(a===b)continue;if(a.position.x===b.position.x&&a.position.y<b.position.y)expect(b.position.y-a.position.y).toBeGreaterThanOrEqual(705);else if(a.position.x<b.position.x)expect(b.position.x-a.position.x).toBeGreaterThanOrEqual(616);}
    const restored=changeLayout(timeline,'canvas');
    expect(restored.nodes.map(n=>n.position)).toEqual(board.nodes.map(n=>n.position));
    expect(restored.edges).toEqual(board.edges);
    expect(restored.nodes.filter(n=>n.type==='paper').every(n=>n.data.appearance?.scale===2)).toBe(true);
  });
  it('undo restores both board defaults and per-card appearance without changing paper metadata',()=>{
    const workspace=initialWorkspace();
    const snapshot=snapshotBoard(workspace);
    const paper=workspace.boards[0].nodes.find(n=>n.type==='paper')!;
    const before=structuredClone(paper.data);
    workspace.boards[0]={...workspace.boards[0],cardDefaults:{fields:{preview:false}},nodes:workspace.boards[0].nodes.map(n=>n.id===paper.id?{...n,data:{...n.data,appearance:{fields:{authors:false},scale:1.7}}} as AppNode:n)};
    const restored=restoreBoard(workspace,snapshot);
    expect(restored.boards[0].cardDefaults).toBeUndefined();
    expect(restored.boards[0].nodes.find(n=>n.id===paper.id)?.data).toEqual(before);
    expect(JSON.parse(JSON.stringify(workspace)).boards[0].cardDefaults.fields.preview).toBe(false);
  });
});
