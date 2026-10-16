import yauzl from 'yauzl';
import CFB from 'cfb';

export const FILE_TYPES = {
  pdf: {kind:'pdf',mimeType:'application/pdf'},
  doc: {kind:'word',mimeType:'application/msword'},
  docx: {kind:'word',mimeType:'application/vnd.openxmlformats-officedocument.wordprocessingml.document'},
  ppt: {kind:'presentation',mimeType:'application/vnd.ms-powerpoint'},
  pptx: {kind:'presentation',mimeType:'application/vnd.openxmlformats-officedocument.presentationml.presentation'},
  jpg: {kind:'image',mimeType:'image/jpeg'},
  jpeg: {kind:'image',mimeType:'image/jpeg'},
  png: {kind:'image',mimeType:'image/png'},
};
export function fileError(status,message){return Object.assign(new Error(message),{status});}
export async function officeEntries(bytes){
  return new Promise((resolve,reject)=>yauzl.fromBuffer(bytes,{lazyEntries:true,validateEntrySizes:true},(error,zip)=>{
    if(error)return reject(fileError(400,'Office 文件容器损坏'));
    const entries=new Map();let count=0,total=0,done=false;
    const fail=message=>{if(done)return;done=true;zip.close();reject(fileError(400,message));};
    zip.on('error',()=>fail('Office 文件容器损坏'));
    zip.on('entry',entry=>{
      total+=entry.uncompressedSize;
      if(++count>20000||total>300*1024*1024||entry.uncompressedSize>100*1024*1024)return fail('Office 文件解压后过大');
      if(entry.fileName.includes('..')||entry.fileName.startsWith('/')||entry.generalPurposeBitFlag&1)return fail('不支持此 Office 文件容器');
      if(/vbaProject\.bin$/i.test(entry.fileName))return fail('请先使用默认软件移除宏，再导入');
      entries.set(entry.fileName,entry);
      zip.readEntry();
    });
    zip.on('end',()=>{if(!done){done=true;resolve(entries);}});
    zip.readEntry();
  }));
}
export async function identifyFile(bytes,name,mime=''){
  const extension=String(name||'').split('.').pop().toLowerCase();
  const type=FILE_TYPES[extension];
  if(!type)throw fileError(415,'支持 PDF、DOC/DOCX、PPT/PPTX、JPG/JPEG/PNG');
  if(!bytes.length||bytes.length>100*1024*1024)throw fileError(413,'单个文件大小必须在 100 MB 内');
  const declared=mime.split(';')[0].trim().toLowerCase();
  if(declared&&!['application/octet-stream','application/zip',type.mimeType].includes(declared))throw fileError(415,'文件内容类型与扩展名不一致');
  let valid=false;
  if(extension==='pdf')valid=bytes.subarray(0,1024).includes(Buffer.from('%PDF-'));
  else if(extension==='png')valid=bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
  else if(['jpg','jpeg'].includes(extension))valid=bytes[0]===255&&bytes[1]===216&&bytes[2]===255;
  else if(['docx','pptx'].includes(extension)){
    const entries=await officeEntries(bytes);
    valid=entries.has('[Content_Types].xml')&&entries.has(extension==='docx'?'word/document.xml':'ppt/presentation.xml');
  }else{
    try{const compound=CFB.read(bytes,{type:'buffer'});valid=compound.FullPaths.some(p=>extension==='doc'?/\/WordDocument$/.test(p):/\/PowerPoint Document$/.test(p));}catch{/* Invalid OLE container. */}
  }
  if(!valid)throw fileError(400,'文件内容与扩展名不符，或文件已损坏/加密');
  return {extension,...type,size:bytes.length};
}
