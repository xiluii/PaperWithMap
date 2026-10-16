import type { AppNode, CardAppearance, CardField } from './types';

export const CARD_WIDTH=278;
export const MIN_CARD_SCALE=.6,MAX_CARD_SCALE=2;
export const DEFAULT_CARD_FIELDS:Record<CardField,boolean>={authors:true,year:true,tags:true,preview:true,venue:true,status:true,abstract:false,content:true,remark:false,dimensions:true};
export function clampCardScale(value:number){return Number.isFinite(value)?Math.round(Math.min(MAX_CARD_SCALE,Math.max(MIN_CARD_SCALE,value))*100)/100:1;}
export function resolveCardAppearance(own?:CardAppearance,defaults?:CardAppearance){
  return {fields:{...DEFAULT_CARD_FIELDS,...defaults?.fields,...own?.fields},scale:clampCardScale(own?.scale??defaults?.scale??1)};
}
export function patchCardAppearance(own:CardAppearance|undefined,patch:CardAppearance):CardAppearance{
  return {...own,...patch,...(patch.fields?{fields:{...own?.fields,...patch.fields}}:{}),...(patch.scale!==undefined?{scale:clampCardScale(patch.scale)}:{})};
}
export function cardFootprint(node:AppNode,defaults?:CardAppearance){
  if(node.type==='section')return {width:CARD_WIDTH,height:30};
  const view=resolveCardAppearance(node.data.appearance,defaults);
  const naturalHeight=node.type==='paper'?120+(view.fields.authors?30:0)+(view.fields.preview?108:0)+(view.fields.tags?30:0)+(view.fields.status||view.fields.venue?32:0)+(view.fields.abstract?90:0):240;
  return {width:Math.max(CARD_WIDTH*view.scale,node.measured?.width||0),height:node.measured?.height||naturalHeight*view.scale};
}
