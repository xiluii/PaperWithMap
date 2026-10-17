import type { InkPoint } from './types';
export type InkShape = 'rectangle' | 'arrow';
export function shapePoints(shape: InkShape, start: InkPoint, end: InkPoint): InkPoint[] {
  const point = (x: number, y: number): InkPoint => ({ x, y, pressure: .5 });
  const a = point(start.x, start.y), b = point(end.x, end.y);
  if (shape === 'rectangle') return [a, point(end.x, start.y), b, point(start.x, end.y), a];
  const distance = Math.hypot(end.x - start.x, end.y - start.y), angle = Math.atan2(end.y - start.y, end.x - start.x), head = Math.min(22, distance * .3);
  return [a, b, point(end.x - head * Math.cos(angle - Math.PI / 6), end.y - head * Math.sin(angle - Math.PI / 6)), b, point(end.x - head * Math.cos(angle + Math.PI / 6), end.y - head * Math.sin(angle + Math.PI / 6))];
}
// Sample straight segments so the handwriting smoother cannot round off an entire corner.
export function shapeStrokePoints(shape: InkShape, start: InkPoint, end: InkPoint): InkPoint[] {
  const vertices=shapePoints(shape,start,end), result=[vertices[0]];
  for(let i=1;i<vertices.length;i++){
    const a=vertices[i-1],b=vertices[i],steps=Math.min(256,Math.max(1,Math.ceil(Math.hypot(b.x-a.x,b.y-a.y)/3)));
    for(let step=1;step<=steps;step++)result.push({x:a.x+(b.x-a.x)*step/steps,y:a.y+(b.y-a.y)*step/steps,pressure:.5});
  }
  return result;
}
