import { describe,expect,it } from 'vitest';
import { anchoredScrollTop,pageIndexAtOffset } from './pdf-scroll';
describe('continuous PDF reading position',()=>{
  it('tracks the actual page through differently sized pages and document ends',()=>{
    const tops=[25,875,1525,2500];
    expect(pageIndexAtOffset(tops,0)).toBe(0);
    expect(pageIndexAtOffset(tops,874)).toBe(0);
    expect(pageIndexAtOffset(tops,875)).toBe(1);
    expect(pageIndexAtOffset(tops,2200)).toBe(2);
    expect(pageIndexAtOffset(tops,8000)).toBe(3);
    expect(pageIndexAtOffset([],10)).toBe(0);
  });
  it('keeps the same place in a page when zoom or a split note changes layout',()=>{
    const old={tops:[25,875,1525],heights:[850,650,975],scrollTop:1200};
    const smaller=anchoredScrollTop(old,[25,475,825],[450,350,500]);
    expect(pageIndexAtOffset([25,475,825],smaller)).toBe(1);
    expect((smaller-475)/350).toBeCloseTo(.5);
    expect(anchoredScrollTop({...old,scrollTop:0},[25,475,825],[450,350,500])).toBe(0);
  });
});
