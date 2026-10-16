import sharp from 'sharp';
import { fileError } from './file-types.mjs';

export async function processImage(bytes){
  try{
    const image=sharp(bytes,{limitInputPixels:80000000,failOn:'error'});
    const metadata=await image.metadata();
    if(!['jpeg','png'].includes(metadata.format))throw new Error('Unsupported image');
    const rotated=[5,6,7,8].includes(metadata.orientation);
    return {width:rotated?metadata.height:metadata.width,height:rotated?metadata.width:metadata.height,
      thumbnail:await image.autoOrient().resize({width:512,height:512,fit:'inside',withoutEnlargement:true}).webp({quality:80}).toBuffer()};
  }catch{throw fileError(400,'无法解码图片，请检查文件是否损坏或超过 8000 万像素');}
}
