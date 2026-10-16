import { useCallback,useEffect,useRef,useState } from 'react';
import type { SuperDoc } from 'superdoc';
import { ArrowDownToLine,Check,LoaderCircle,Monitor,Save } from 'lucide-react';
import type { FileInfo } from '../types';
import type { FileReaderProps } from './file-reader-types';
import { fileUrl,openDefaultFile,saveWordDocument } from '../backend';
import { Modal } from './Dialogs';
import AssetNotes from './AssetNotes';
import FocusModeButton from './FocusModeButton';
import { ReadingTranslationToggle, useReadingTranslation } from './ReadingTranslation';
import useFocusMode from '../useFocusMode';
import 'superdoc/style.css';

export default function WordEditor(props:FileReaderProps&{info:FileInfo}){
  const {paper,onClose,info}=props,focus=useFocusMode('reader');
  const container=useRef<HTMLDivElement>(null),toolbar=useRef<HTMLDivElement>(null),editor=useRef<SuperDoc|null>(null);
  const translation=useReadingTranslation(),translationRef=useRef(translation);translationRef.current=translation;
  const revision=useRef(info.revision),editVersion=useRef(0),savedVersion=useRef(0),readyRef=useRef(false),busyRef=useRef(false);
  const [ready,setReady]=useState(false),[version,setVersion]=useState(0),[saved,setSaved]=useState(0),[busy,setBusy]=useState(false),[error,setError]=useState(''),[closing,setClosing]=useState(false),[attempt,setAttempt]=useState(0);
  const downloadName=(paper.fileName||paper.title).replace(/\.(doc|docx)$/i,'')+'.docx';
  const dirty=version!==saved;
  useEffect(()=>{
    let live=true,selectionVersion=0;let instance:SuperDoc|undefined;const controller=new AbortController();setReady(false);readyRef.current=false;setError('');
    const load=async()=>{try{
      const [{SuperDoc},response]=await Promise.all([import('superdoc'),fetch(fileUrl(paper.fileId!),{signal:controller.signal})]);
      if(!response.ok)throw new Error('无法读取本地 Word 文档');const document=new Blob([await response.arrayBuffer()],{type:'application/vnd.openxmlformats-officedocument.wordprocessingml.document'});
      if(!live||!container.current||!toolbar.current)return;
      instance=new SuperDoc({selector:container.current,document,documentMode:'editing',user:{name:'本地用户',email:'local@paperly.invalid'},telemetry:{enabled:false},fonts:{bundled:false},
        extensions:[{id:'paperly.dictionary-selection',activate:context=>context.onSelection(event=>{
          const version=++selectionVersion;
          if(!translationRef.current?.enabled||!container.current)return;
          if(event.collapsed){translationRef.current.reportWordSelection(null,container.current);return;}
          void Promise.resolve(context.doc.selection.current({includeText:true})).then(selected=>{
            if(live&&version===selectionVersion&&translationRef.current?.enabled&&container.current)translationRef.current.reportWordSelection(selected.empty?null:selected.text||null,container.current);
          }).catch(()=>{/* An unsettled editor selection can be selected again. */});
        })}],
        ui:{comments:false,search:true,toolbar:{container:toolbar.current,responsiveTo:'container',overflow:'menu',
          items:{left:['undo','redo','search'],center:['font-family','font-size','bold','italic','underline','strikethrough','text-color','highlight-color','linked-style','text-align','bullet-list','numbered-list','indent-decrease','indent-increase','line-height','link','image','table','table-actions','clear-formatting'],right:['zoom']},
          strings:{undo:'撤销',redo:'重做',search:'查找与替换',bold:'加粗',italic:'斜体',underline:'下划线',strikethrough:'删除线','font-family':'字体','font-size':'字号','text-color':'字色','highlight-color':'高亮','text-align':'段落对齐','bullet-list':'项目列表','numbered-list':'编号列表','indent-decrease':'减少缩进','indent-increase':'增加缩进','line-height':'行距',link:'链接',image:'插入图片',table:'插入表格','table-actions':'表格操作','clear-formatting':'清除格式',zoom:'缩放'},
          fontOptions:[{label:'宋体',value:'SimSun'},{label:'微软雅黑',value:'Microsoft YaHei'},{label:'黑体',value:'SimHei'},{label:'Arial',value:'Arial'},{label:'Times New Roman',value:'Times New Roman'}]}},
        onReady:()=>{if(!live)return;readyRef.current=true;setReady(true);},
        onEditorUpdate:()=>{if(live&&readyRef.current){editVersion.current+=1;setVersion(editVersion.current);setError('');}},
        onContentError:({error})=>{if(live)setError(error instanceof Error?error.message:'无法解析 Word 文档，请使用默认软件检查格式');},
        onException:({error})=>{if(live)setError(error instanceof Error?error.message:'编辑内核遇到问题，修改仍保留在当前页面，请尝试下载编辑稿');},
      });editor.current=instance;
    }catch(e){if(live&&!controller.signal.aborted)setError((e as Error).message);}};
    void load();return()=>{live=false;readyRef.current=false;controller.abort();instance?.destroy();if(editor.current===instance)editor.current=null;};
  },[paper.fileId,attempt]);
  const save=useCallback(async()=>{
    if(!editor.current||!readyRef.current||busyRef.current)return false;
    busyRef.current=true;setBusy(true);setError('');const snapshot=editVersion.current;
    try{
      const document=await editor.current.export({exportType:['docx'],triggerDownload:false});
      if(!(document instanceof Blob))throw new Error('编辑器未生成有效 DOCX，未覆盖本地文件');
      const result=await saveWordDocument(paper.fileId!,document,revision.current);revision.current=result.revision;
      savedVersion.current=snapshot;setSaved(snapshot);return editVersion.current===snapshot;
    }catch(e){setError((e as Error).message);return false;}finally{busyRef.current=false;setBusy(false);}
  },[paper.fileId]);
  useEffect(()=>{if(!dirty||!ready||busy||error)return;const timer=setTimeout(()=>void save(),1400);return()=>clearTimeout(timer);},[version,ready,busy,error,save]);
  useEffect(()=>{if(!dirty)return;const before=(event:BeforeUnloadEvent)=>{event.preventDefault();event.returnValue='';};window.addEventListener('beforeunload',before);return()=>window.removeEventListener('beforeunload',before);},[dirty]);
  const close=()=>{if(busyRef.current)return;if(editVersion.current!==savedVersion.current)setClosing(true);else onClose();};
  const external=async()=>{if(busyRef.current)return;if(editVersion.current!==savedVersion.current&&!await save())return;try{await openDefaultFile(paper.fileId!);}catch(e){setError((e as Error).message);}};
  const download=async()=>{try{await editor.current?.export({exportType:['docx'],exportedName:downloadName.replace(/\.docx$/i,'')});}catch(e){setError((e as Error).message);}};
  return <Modal title={paper.title} onClose={close} className={`paper-reader-modal asset-reader-modal word-reader-modal ${focus.focused?'reader-focused':''}`} onKeyDown={focus.onKeyDown} headingActions={<><ReadingTranslationToggle/><FocusModeButton focused={focus.focused} onToggle={focus.toggle} label="专注编辑"/></>}><div className="asset-reader-body" onKeyDown={event=>{if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='s'){event.preventDefault();event.stopPropagation();void save();}}}>
    <div className="asset-command-bar word-command-bar"><div className="word-document-caption"><span className="word-file-badge">W</span><div><b>{paper.title}</b><small>Word 文档 · 本地编辑 · DOCX</small></div></div><div className="asset-command-actions"><span className={`word-save-status ${dirty?'unsaved':''}`} role="status">{busy?'正在保存…':!ready?'正在打开…':dirty?'有未保存修改':'已保存到本地'}</span><button className="secondary-button" disabled={!ready||busy} onClick={()=>void external()}><Monitor size={14}/>默认软件</button><button className="secondary-button" disabled={!ready||busy} onClick={()=>void download()}><ArrowDownToLine size={14}/>下载 DOCX</button><button className="primary-button" disabled={!ready||busy||!dirty} onClick={()=>void save()}>{busy?<LoaderCircle className="spin" size={14}/>:<Save size={14}/>}保存</button><button className="icon-button" title="标记已读" aria-label="标记已读" onClick={props.onRead}><Check size={16}/></button></div></div>
    {error&&<div className="pdf-message error" role="alert">{error}{!ready&&<button className="plain-button" onClick={()=>setAttempt(v=>v+1)}>重新加载</button>}</div>}
    <AssetNotes reader={props} getWordText={async()=>{if(!readyRef.current)throw new Error('Word 编辑器尚未准备好');const text=await editor.current?.activeEditor?.doc?.getText({});if(typeof text!=='string')throw new Error('无法读取当前 Word 内容，请稍后重试');return text;}}><div className="word-editor-shell"><div ref={toolbar} className="word-formatting-toolbar" aria-label="Word 基础编辑工具"/><div className="word-document-scroll"><div ref={container} className="word-editor-mount" data-native-context-menu/>{!ready&&!error&&<div className="word-loading"><span className="spinner"/>正在加载 Word 文档…</div>}</div></div></AssetNotes>
  </div>{closing&&<Modal title="保存 Word 修改？" onClose={()=>setClosing(false)}><div className="confirm-body"><p>Word 文档还有未保存的修改。关联的手写笔记已独立自动保存。</p>{error&&<p className="reader-inline-error" role="alert">{error}</p>}<div className="modal-actions"><button className="plain-button" disabled={busy} onClick={onClose}>放弃本次修改</button><button className="secondary-button" disabled={busy} onClick={()=>setClosing(false)}>继续编辑</button><button className="primary-button" disabled={busy} onClick={async()=>{if(await save())onClose();}}>保存并关闭</button></div></div></Modal>}</Modal>;
}
