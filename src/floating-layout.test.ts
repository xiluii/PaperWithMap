import { describe, expect, it } from 'vitest';
import { clampFloating, studyDimensions } from './floating-layout';
import { shapePoints, shapeStrokePoints } from './ink-shapes';
import { strokeHit, strokeOutline } from './ink-model';
import type { InkStroke } from './types';

describe('study desk geometry', () => {
  it('keeps a dragged toolbar reachable after canvas shrink and invalid saved coordinates', () => {
    expect(clampFloating({x:900,y:800},{width:400,height:300},{width:320,height:100})).toEqual({x:72,y:192});
    expect(clampFloating({x:NaN,y:-300},{width:50,height:40},{width:320,height:100})).toEqual({x:8,y:8});
  });
  it('shares width and height without overflowing either split at common desktop sizes', () => {
    for (const [width,height] of [[760,480],[1280,620],[1920,1000]]) for (const ratio of [.15,.56,.85]) {
      const sizes=studyDimensions(width,height,ratio,ratio,360,340,180,260);
      expect(sizes.main+sizes.side+1).toBeCloseTo(width);expect(sizes.top+sizes.bottom+1).toBeCloseTo(height);
      expect(sizes.main).toBeGreaterThanOrEqual(360);expect(sizes.side).toBeGreaterThanOrEqual(340);
      expect(sizes.top).toBeGreaterThanOrEqual(sizes.minRow);expect(sizes.top).toBeLessThanOrEqual(sizes.maxRow);
    }
  });
});
describe('framework drawing tools', () => {
  const start={x:180,y:140,pressure:.1},end={x:20,y:30,pressure:1};
  const stroke=(points:InkStroke['points']):InkStroke=>({id:'shape',points,color:'#263a32',width:3,tool:'pen',pressure:false,simulatePressure:false});
  it('closes rectangles drawn in either direction and lets the existing eraser hit all edges', () => {
    const points=shapePoints('rectangle',start,end);expect(points[0]).toEqual(points.at(-1));
    const sampled=shapeStrokePoints('rectangle',start,end);expect(sampled.length).toBeGreaterThan(50);expect(sampled.at(-1)).toEqual(sampled[0]);
    const rectangle=stroke(sampled);expect(strokeOutline(rectangle).length).toBeGreaterThan(4);
    expect(strokeHit(rectangle,{x:100,y:30,pressure:.5},5)).toBe(true);
    expect(strokeHit(rectangle,{x:100,y:80,pressure:.5},5)).toBe(false);
  });
  it('keeps arrow heads behind the endpoint at every orientation, including zero length', () => {
    for (const end of [{x:300,y:140},{x:180,y:300},{x:20,y:30},start]) {
      const points=shapePoints('arrow',start,{...end,pressure:1});expect(points.every(p=>Number.isFinite(p.x)&&Number.isFinite(p.y))).toBe(true);
      const direction={x:end.x-start.x,y:end.y-start.y};for(const p of [points[2],points[4]])expect((p.x-end.x)*direction.x+(p.y-end.y)*direction.y).toBeLessThanOrEqual(0);
      expect(strokeOutline(stroke(points)).length).toBeGreaterThan(0);
    }
  });
});
