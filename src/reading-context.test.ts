import { afterEach, describe, expect, it, vi } from 'vitest';
import { formulaContext } from './reading-context';
import { resolveReadingScope, selectionCrop } from './reading-evidence';

afterEach(()=>vi.unstubAllGlobals());
describe('reading evidence follows the current question',()=>{
  it('preserves selected equation pixels instead of sending only extracted glyphs',()=>{
    const selected={text:'E_3 = x + 3',page:3,x:10,y:20,image:'data:image/jpeg;base64,AAAA'};
    expect(formulaContext(selected)).toEqual({kind:'selection',text:selected.text,page:3,image:selected.image});
  });
  it('refreshes the visible PDF page on follow-up questions unless history is explicitly selected',()=>{
    expect(resolveReadingScope('auto','pdf',false)).toBe('page');
    expect(resolveReadingScope('selection','pdf',false)).toBe('page');
    expect(resolveReadingScope('auto','pdf',true)).toBe('selection');
    expect(resolveReadingScope('saved','pdf',true)).toBe('saved');
    expect(resolveReadingScope('document','pdf',true)).toBe('document');
    expect(resolveReadingScope('auto','word',false)).toBe('document');
    expect(resolveReadingScope('auto','presentation',false)).toBe('page');
  });
  it('crops a zoomed and scrolled page in image coordinates, clamping at each edge',()=>{
    expect(selectionCrop({left:210,top:-300,width:600,height:900},{left:240,top:40,width:180,height:70},1200,1800)).toEqual({x:44,y:664,width:392,height:172});
    const edge=selectionCrop({left:10,top:20,width:600,height:900},{left:-20,top:0,width:90,height:50},1200,1800);
    expect(edge.x).toBe(0);expect(edge.y).toBe(0);expect(edge.width).toBeLessThanOrEqual(1200);expect(edge.height).toBeLessThanOrEqual(1800);
  });
});
