import { lazy,Suspense,useEffect,useRef,useState } from 'react';
import { ArrowUpRight,BookOpen,FileText,Monitor,RefreshCw } from 'lucide-react';
import type { FileReaderProps } from './file-reader-types';
import { ASSET_LABELS,getAssetKind } from '../asset-model';
import { openDefaultFile } from '../backend';
import useAssetPreview from '../useAssetPreview';
import { Modal } from './Dialogs';
import PaperReader from './PaperReader';
import ImageReader from './ImageReader';
import { ReadingTranslationProvider } from './ReadingTranslation';
import '../asset-reader.css';

const WordEditor=lazy(()=>import('./WordEditor'));
export default function FileReader(props:FileReaderProps){
  const kind=getAssetKind(props.paper);
  if(kind==='image')return <ImageReader {...props}/>;
  return <ReadingTranslationProvider key={props.paper.fileId}>{kind==='pdf'?<PaperReader {...props}/>:<OfficeReader {...props}/>}</ReadingTranslationProvider>;
}
function OfficeReader(props:FileReaderProps){
  const {paper,onClose}=props,kind=getAssetKind(paper);
  const [internal,setInternal]=useState(false),[opening,setOpening]=useState(false),[openError,setOpenError]=useState('');
  const {info,error,retry}=useAssetPreview(paper.fileId!);
  const update=useRef(props.onUpdate);update.current=props.onUpdate;
  useEffect(()=>{if(!info)return;const {kind:assetKind,extension,mimeType,size,previewStatus,width,height}=info;update.current({asset:{kind:assetKind,extension,mimeType,size,previewStatus,width,height},pages:info.pages});},[info]);
  const external=async()=>{setOpening(true);setOpenError('');try{await openDefaultFile(paper.fileId!);onClose();}catch(e){setOpenError((e as Error).message);}finally{setOpening(false);}};
  if(internal&&info?.previewStatus==='ready'){
    if(kind==='word')return <Suspense fallback={<Modal title="正在加载 Word 编辑内核" onClose={onClose}><div className="reader-loading"><span className="spinner"/>正在准备本地编辑器…</div></Modal>}><WordEditor {...props} info={info}/></Suspense>;
    return <PaperReader {...props} paper={{...paper,fileName:paper.fileName?.replace(/\.[^.]+$/,'.pdf')}} initialMode="internal"/>;
  }
  const failed=info?.previewStatus==='failed';
  return <Modal title={internal?'正在准备文件':'打开文件'} onClose={onClose} className="open-paper-modal"><div className="open-paper-heading"><span><FileText size={25}/></span><div><h3>{paper.title}</h3><p>{ASSET_LABELS[kind]} · {paper.fileName} · 本地资料库</p></div></div>
    {!internal?<div className="open-paper-options"><button onClick={()=>setInternal(true)}><span className="open-option-icon"><BookOpen size={24}/></span><div><strong>在 Paperly 内{kind==='word'?'编辑':'打开'} <small>推荐</small></strong><p>{kind==='word'?'直接编辑 Word，保存为 DOCX；右侧书写关联笔记':'连续阅读全部幻灯片，批注与笔记随时关联'}</p></div><ArrowUpRight size={18}/></button><button disabled={opening} onClick={()=>void external()}><span className="open-option-icon neutral"><Monitor size={23}/></span><div><strong>用默认软件打开</strong><p>调用本机默认的 {kind==='word'?'Word':'PowerPoint'} 软件</p></div><ArrowUpRight size={18}/></button></div>:<div className="asset-conversion-state">{!failed&&!error&&<span className="spinner"/>}<p>{error||info?.previewError||(kind==='word'?'正在将旧版 DOC 准备为可编辑的 DOCX，原件会保留。':'正在本地生成幻灯片预览，请稍候。')}</p>{(failed||error)&&<button className="secondary-button" onClick={()=>void retry()}><RefreshCw size={14}/>重试</button>}<button className="secondary-button" disabled={opening} onClick={()=>void external()}><Monitor size={14}/>用默认软件打开</button></div>}
    {openError&&<p className="reader-inline-error" role="alert">{openError}</p>}<div className="open-paper-footer">文件与笔记保存在本地 · 无需登录{kind==='presentation'&&info?.previewStatus==='ready'&&<button className="plain-button" onClick={()=>void retry(true)}><RefreshCw size={12}/>更新平台预览</button>}</div></Modal>;
}
