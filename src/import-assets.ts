import type { PaperData } from './types';
import { kindFromName } from './asset-model';
import { thumbnailUrl,uploadAsset } from './backend';
import { now,uid } from './model';

export async function importAsset(file:File):Promise<PaperData>{
  const kind=kindFromName(file.name);
  if(!kind)throw new Error('不支持此文件类型');
  if(file.size>100*1024*1024)throw new Error('单个文件请控制在 100 MB 内');
  if(kind==='pdf'){const {parsePdf}=await import('./pdf');return parsePdf(file);}
  const fileId=uid(),info=await uploadAsset(fileId,file);
  const {kind:assetKind,extension,mimeType,size,previewStatus,width,height}=info;
  return {title:file.name.replace(/\.[^.]+$/,''),authors:'',venue:'',tags:[],status:'unread',starred:false,abstract:'',remark:'',
    addedAt:now(),fileId,fileName:file.name,pages:info.pages,accent:kind==='image'?'peach':kind==='word'?'blue':'lavender',
    ...(kind==='image'?{thumbnail:thumbnailUrl(fileId)}:{}),asset:{kind:assetKind,extension,mimeType,size,previewStatus,width,height}};
}
