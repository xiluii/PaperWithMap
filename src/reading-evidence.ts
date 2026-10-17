import type { AssetKind } from './types';
export type ReadingScope='auto'|'document'|'page'|'selection'|'saved';
export function resolveReadingScope(scope:ReadingScope,kind:AssetKind,selected:boolean):Exclude<ReadingScope,'auto'> {
  if(scope!=='auto'&&!(scope==='selection'&&!selected))return scope;
  return selected?'selection':kind==='pdf'||kind==='presentation'?'page':'document';
}
type Rectangle={left:number;top:number;width:number;height:number};
export function selectionCrop(page:Rectangle,selected:Rectangle,imageWidth:number,imageHeight:number){
  const x=Math.max(0,(selected.left-page.left-8)/page.width*imageWidth),y=Math.max(0,(selected.top-page.top-8)/page.height*imageHeight);
  const right=Math.min(imageWidth,(selected.left+selected.width-page.left+8)/page.width*imageWidth),bottom=Math.min(imageHeight,(selected.top+selected.height-page.top+8)/page.height*imageHeight);
  if(right<=x||bottom<=y)throw new Error('选区不在当前 PDF 页面内，请重新选择');
  return {x:Math.floor(x),y:Math.floor(y),width:Math.ceil(right-x),height:Math.ceil(bottom-y)};
}
