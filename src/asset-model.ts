import type { AssetKind,CardField,PaperData } from './types';

export const ACCEPTED_FILES='.pdf,.doc,.docx,.ppt,.pptx,.jpg,.jpeg,.png';
export const ASSET_LABELS:Record<AssetKind,string>={pdf:'PDF',word:'WORD',presentation:'PPT',image:'图片'};
const kinds:Record<string,AssetKind>={pdf:'pdf',doc:'word',docx:'word',ppt:'presentation',pptx:'presentation',jpg:'image',jpeg:'image',png:'image'};
export const extensionOf=(name:string)=>name.split('.').pop()?.toLowerCase()||'';
export const kindFromName=(name:string):AssetKind|undefined=>kinds[extensionOf(name)];
export const getAssetKind=(data:Pick<PaperData,'asset'|'fileName'>):AssetKind=>data.asset?.kind||kindFromName(data.fileName||'')||'pdf';
export function getAssetCapabilities(kind:AssetKind){return {internalPreview:true,externalOpen:kind!=='image',handwrittenNotes:true,connections:true,pdfInk:kind==='pdf'||kind==='presentation',editable:kind==='word'};}
export function availableFields(kind:AssetKind):CardField[]{return kind==='pdf'?['authors','year','tags','preview','venue','status','abstract','remark']:kind==='image'?['preview','tags','status','remark','dimensions']:['authors','year','preview','tags','status','remark'];}
export function timelineGroup(data:Pick<PaperData,'year'|'readAt'|'addedAt'>,by:'year'|'read'){return by==='year'?(data.year?String(data.year):'未设置年份'):(data.readAt||data.addedAt).slice(0,10);}
export function compareAssets(a:PaperData,b:PaperData,by:'year'|'read'){return by==='year'?(a.year||9999)-(b.year||9999):(a.readAt||a.addedAt).localeCompare(b.readAt||b.addedAt);}
export const assetSearchText=(data:PaperData)=>[data.title,data.authors,data.fileName,data.remark,...data.tags,ASSET_LABELS[getAssetKind(data)]].filter(Boolean).join(' ').toLowerCase();
