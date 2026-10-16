import { describe,expect,it } from 'vitest';
import { compareAssets,getAssetCapabilities,getAssetKind,kindFromName,timelineGroup } from './asset-model';
import { initialWorkspace } from './seed';
import { changeLayout,paperNodes } from './model';

describe('mixed file cards',()=>{
  it('keeps old PDF cards compatible and recognizes uppercase extensions',()=>{
    expect(getAssetKind({})).toBe('pdf');expect(kindFromName('研究.DOCX')).toBe('word');expect(kindFromName('slide.PPT')).toBe('presentation');expect(kindFromName('photo.JPEG')).toBe('image');expect(kindFromName('run.exe')).toBeUndefined();
  });
  it('edits Word directly and keeps notes and connections on every type',()=>{
    expect(getAssetCapabilities('word')).toMatchObject({editable:true,pdfInk:false,handwrittenNotes:true});
    expect(getAssetCapabilities('image')).toMatchObject({connections:true,internalPreview:true,externalOpen:false});
  });
  it('keeps undated images in a stable timeline group and preserves their IDs',()=>{
    const board=initialWorkspace().boards[0],paper=paperNodes(board.nodes)[0];
    paper.data={...paper.data,year:undefined};const edges=structuredClone(board.edges);
    expect(timelineGroup(paper.data,'year')).toBe('未设置年份');expect(compareAssets(paper.data,{...paper.data,year:2025},'year')).toBeGreaterThan(0);
    const next=changeLayout(board,'timeline');expect(Number.isFinite(next.nodes.find(n=>n.id===paper.id)?.position.x)).toBe(true);expect(next.edges).toEqual(edges);
  });
});
