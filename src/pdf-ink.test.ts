import { describe,expect,it } from 'vitest';
import { placeNoteInk } from './pdf-ink';
import type { InkStroke } from './types';
import { inkBounds } from './ink-model';
describe('existing handwriting placement',()=>{
  it('fits and clamps a copy to the PDF without mutating its source note',()=>{const stroke:InkStroke={id:'old',color:'#f0f0d8',width:3,tool:'pen',pressure:true,simulatePressure:false,points:[{x:-300,y:20,pressure:.2},{x:1900,y:900,pressure:.8}]};const source=structuredClone(stroke);const placed=placeNoteInk([stroke],600,800,0,800);const bounds=inkBounds(placed);expect(bounds.x).toBeGreaterThanOrEqual(-1);expect(bounds.y+bounds.height).toBeLessThanOrEqual(801);expect(placed[0].id).not.toBe('old');expect(placed[0].color).toBe('#263a32');expect(placed[0].points[1].pressure).toBe(.8);expect(stroke).toEqual(source);});
  it('keeps colored ink and handles empty notes',()=>{expect(placeNoteInk([],600,800,300,400)).toEqual([]);});
});
