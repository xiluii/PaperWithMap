import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath,pathToFileURL } from 'node:url';
import { spawn } from 'node:child_process';
import { fileError } from './file-types.mjs';

const exists=async file=>{try{await fs.access(file);return true;}catch{return false;}};
async function programOnPath(name){for(const folder of (process.env.PATH||'').split(path.delimiter)){const file=path.join(folder,name);if(await exists(file))return file;}}
export async function officeCapabilities(){
  const candidates=[process.env.PAPERLY_SOFFICE_PATH,
    'C:/Program Files/LibreOffice/program/soffice.com','C:/Program Files (x86)/LibreOffice/program/soffice.com'];
  let libreoffice;for(const candidate of candidates)if(candidate&&await exists(candidate)){libreoffice=candidate;break;}
  libreoffice||=await programOnPath(process.platform==='win32'?'soffice.com':'soffice');
  const officeRoots=['C:/Program Files/Microsoft Office/Root/Office16','C:/Program Files (x86)/Microsoft Office/Root/Office16'];
  const word=process.platform==='win32'&&(await Promise.all(officeRoots.map(root=>exists(path.join(root,'WINWORD.EXE'))))).some(Boolean);
  const presentation=process.platform==='win32'&&(await Promise.all(officeRoots.map(root=>exists(path.join(root,'POWERPNT.EXE'))))).some(Boolean);
  let wordConverter;for(const root of officeRoots){const file=path.join(root,'wordconv.exe');if(process.platform==='win32'&&await exists(file)){wordConverter=file;break;}}
  return {libreoffice,wordConverter,word:word||!!wordConverter||!!libreoffice,presentation:presentation||!!libreoffice,
    engine:libreoffice?'LibreOffice':word||presentation?'Microsoft Office':'unavailable'};
}
function run(executable,args){return new Promise((resolve,reject)=>{
  const child=spawn(executable,args,{shell:false,windowsHide:true});let output='';
  const timer=setTimeout(()=>{child.kill();reject(fileError(422,'文档转换超时，请使用默认软件检查原文件后重试'));},120000);
  child.stdout.on('data',chunk=>{output=(output+chunk).slice(-4000);});child.stderr.on('data',chunk=>{output=(output+chunk).slice(-4000);});
  child.once('error',error=>{clearTimeout(timer);reject(error);});child.once('close',code=>{clearTimeout(timer);code===0?resolve():reject(fileError(422,'本地 Office 转换失败，请检查文件是否加密或被占用'));});
});}
export async function convertOffice(sourcePath,outputDir,kind){
  await fs.mkdir(outputDir,{recursive:true});const capabilities=await officeCapabilities();
  if(!capabilities[kind])throw fileError(422,'未找到本地转换器，请安装 Microsoft Office 或配置 PAPERLY_SOFFICE_PATH 后重试');
  const extension=kind==='word'?'docx':'pdf',output=path.join(outputDir,path.parse(sourcePath).name+'.'+extension);
  if(capabilities.libreoffice){
    const profile=path.join(outputDir,'profile');await fs.mkdir(path.join(profile,'user'),{recursive:true});
    await fs.writeFile(path.join(profile,'user','registrymodifications.xcu'),'<?xml version="1.0" encoding="UTF-8"?><oor:items xmlns:oor="http://openoffice.org/2001/registry"><item oor:path="/org.openoffice.Office.Common/Security/Scripting"><prop oor:name="MacroSecurityLevel" oor:op="fuse"><value>3</value></prop></item></oor:items>');
    await run(capabilities.libreoffice,[`-env:UserInstallation=${pathToFileURL(profile).href}`,'--headless','--nologo','--nodefault','--norestore','--convert-to',kind==='word'?'docx:Office Open XML Text':'pdf:impress_pdf_Export','--outdir',outputDir,sourcePath]);
  }else if(kind==='word'&&capabilities.wordConverter){
    await run(capabilities.wordConverter,['-oice','-nme',sourcePath,output]);
  }else{
    const script=fileURLToPath(new URL('./convert-office.ps1',import.meta.url));
    await run('powershell.exe',['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',script,'-SourceFile',sourcePath,'-OutputFile',output,'-Kind',kind]);
  }
  if(!await exists(output))throw fileError(422,'转换器没有生成有效文档，请检查源文件');
  return fs.readFile(output);
}
