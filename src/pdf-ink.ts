import type { InkStroke } from './types';
import { inkBounds } from './ink-model';
import { uid } from './model';

export function placeNoteInk(strokes:InkStroke[],pageWidth:number,pageHeight:number,x:number,y:number):InkStroke[]{
  if(!strokes.length)return [];
  const bounds=inkBounds(strokes),scale=Math.min(1,pageWidth*.5/bounds.width,pageHeight*.35/bounds.height);
  const width=bounds.width*scale,height=bounds.height*scale;
  const left=Math.max(0,Math.min(pageWidth-width,x-width/2)),top=Math.max(0,Math.min(pageHeight-height,y-height/2));
  return strokes.map(stroke=>{const c=stroke.color.slice(1);const light=(parseInt(c.slice(0,2),16)*.2126+parseInt(c.slice(2,4),16)*.7152+parseInt(c.slice(4,6),16)*.0722)/255;return {...stroke,id:uid(),width:Math.max(.25,stroke.width*scale),color:light>.84&&stroke.tool==='pen'?'#263a32':stroke.color,points:stroke.points.map(p=>({...p,x:left+(p.x-bounds.x)*scale,y:top+(p.y-bounds.y)*scale}))};});
}
