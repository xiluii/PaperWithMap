import { fileUrl } from './backend';
export async function getPdf(id:string){const response=await fetch(fileUrl(id));if(!response.ok)throw new Error('无法读取本地 PDF，请确认后端已启动，文件仍在资料库内。');return response.blob();}
