import { describe,expect,it } from 'vitest';
import { clampImagePan,fitImage,zoomImageAt } from './image-view';
describe('image preview geometry',()=>{
  it('fits large images without stretching small images',()=>{expect(fitImage(2000,1000,1048,700)).toBe(.5);expect(fitImage(200,100,1048,700)).toBe(1);});
  it('keeps the point under the cursor fixed while zooming',()=>{const original={zoom:1,x:20,y:-10},next=zoomImageAt(original,2,100,50);expect((100-next.x)/next.zoom).toBe((100-original.x)/original.zoom);expect((50-next.y)/next.zoom).toBe((50-original.y)/original.zoom);});
  it('clamps manual zoom',()=>{expect(zoomImageAt({zoom:1,x:0,y:0},99,0,0).zoom).toBe(8);expect(zoomImageAt({zoom:1,x:0,y:0},0,0,0).zoom).toBe(.25);});
  it('keeps images within reachable pan bounds',()=>{expect(clampImagePan({zoom:1,x:9999,y:-9999},800,500,1000,700)).toEqual({zoom:1,x:0,y:0});const view=clampImagePan({zoom:2,x:9999,y:-9999},800,500,1000,700);expect(view.x).toBe(324);expect(view.y).toBe(-174);});
});
