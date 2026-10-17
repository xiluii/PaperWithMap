import { ArrowUpRight, BookOpen, Calendar, Check, FileText, Link2, Star, Trash2, X } from 'lucide-react';
import type { AppNode, AppEdge, CardAppearance, PaperData, TextData } from '../types';
import { STATUS_LABELS } from '../types';
import RichEditor from './RichEditor';
import { useEffect, useState } from 'react';
import CardAppearanceSettings from './CardAppearanceSettings';
import { ASSET_LABELS,getAssetKind } from '../asset-model';
import {SidebarControls,useDockSide,usePanelWidth} from './PanelControls';

function TagInput({id,tags,onChange}:{id:string;tags:string[];onChange:(tags:string[])=>void}){
  const [draft,setDraft]=useState(tags.join(', '));
  useEffect(()=>setDraft(tags.join(', ')),[id]);
  return <input aria-label="文献标签" value={draft} onChange={e=>{setDraft(e.target.value);onChange(e.target.value.split(/[,，]/).map(t=>t.trim()).filter(Boolean));}}/>;
}

export default function Inspector({node,edge,nodes,onClose,update,updateEdge,remove,open,appearanceTab,onAppearanceTab,cardDefaults,onAppearance,onResetAppearance,onResizeStart,onResizeEnd}:{node?:AppNode;edge?:AppEdge;nodes:AppNode[];onClose:()=>void;update:(data:Partial<PaperData>|Partial<TextData>)=>void;updateEdge:(edge:AppEdge)=>void;remove:()=>void;open:()=>void;appearanceTab:boolean;onAppearanceTab:(active:boolean)=>void;cardDefaults?:CardAppearance;onAppearance:(patch:CardAppearance)=>void;onResetAppearance:()=>void;onResizeStart:()=>void;onResizeEnd:()=>void}){
  const [width,setWidth]=usePanelWidth('inspector',310),[side,setSide]=useDockSide('inspector','right');
  if(!node&&!edge)return null;
  const paper=node?.type==='paper'?node.data:null;
  const text=node?.type==='text'?node.data:null;
  const assetKind=paper?getAssetKind(paper):'pdf';
  return <aside className="inspector" style={{width,order:side==='left'?0:2}}><SidebarControls label="卡片详情侧栏" side={side} onSide={setSide} width={width} onWidth={setWidth} reset={310}/><div className="inspector-heading"><span>{edge?<Link2 size={15}/>:paper?<FileText size={15}/>:<FileText size={15}/>} {edge?'连接关系':paper?'文献信息':'编辑灵感'}</span><button className="icon-button" onClick={onClose} title="关闭详情" aria-label="关闭详情"><X size={17}/></button></div>
  {(paper||text)&&<div className="inspector-tabs" role="tablist" aria-label="卡片设置"><button role="tab" aria-selected={!appearanceTab} onClick={()=>onAppearanceTab(false)}>资料编辑</button><button role="tab" aria-selected={appearanceTab} onClick={()=>onAppearanceTab(true)}>卡片显示</button></div>}
  {appearanceTab&&(paper||text)?<div className="inspector-body"><CardAppearanceSettings value={(paper||text)?.appearance} defaults={cardDefaults} kind={paper?'paper':'text'} assetKind={assetKind} onChange={onAppearance} onReset={onResetAppearance} onStart={onResizeStart} onEnd={onResizeEnd}/></div>:<div className="inspector-body">{paper&&<>
    <div className="inspector-eyebrow">{ASSET_LABELS[assetKind]} 资料 <button className={`icon-button ${paper.starred?'is-starred':''}`} title="收藏" onClick={()=>update({starred:!paper.starred})}><Star size={16} fill={paper.starred?'currentColor':'none'}/></button></div>
    <label className="field title-field">显示名称<textarea aria-label="文件显示名称" value={paper.title} onChange={e=>update({title:e.target.value})}/></label>
    <button className="primary-button full" onClick={open}><BookOpen size={15}/>{assetKind==='word'?'编辑 Word':assetKind==='image'?'查看图片':'阅读文件'}<ArrowUpRight size={14}/></button><div className="inspector-divider"/>
    {assetKind!=='image'&&<><label className="field">作者<input value={paper.authors} onChange={e=>update({authors:e.target.value})}/></label><div className="field-row"><label className="field">发表年份<input type="number" min="1800" max="2200" placeholder="未设置" value={paper.year??''} onChange={e=>update({year:e.target.value?Number(e.target.value):undefined})}/></label><label className="field">阅读状态<select value={paper.status} onChange={e=>update({status:e.target.value as PaperData['status'],...(e.target.value==='read'?{readAt:new Date().toISOString()}:{})})}>{Object.entries(STATUS_LABELS).map(([v,t])=><option key={v} value={v}>{t}</option>)}</select></label></div></>}
    {assetKind==='pdf'&&<label className="field">期刊 / 会议<input value={paper.venue} onChange={e=>update({venue:e.target.value})}/></label>}
    <label className="field">标签<span className="field-description">以逗号分隔</span><TagInput id={node!.id} tags={paper.tags} onChange={tags=>update({tags})}/></label>
    {assetKind==='pdf'&&<label className="field">摘要与阅读笔记<textarea className="abstract-input" value={paper.abstract} placeholder="记录核心观点…" onChange={e=>update({abstract:e.target.value})}/></label>}
    <label className="field">备注<textarea aria-label="文件备注" className="abstract-input" value={paper.remark||''} placeholder="记录文件来源、内容或想法…" onChange={e=>update({remark:e.target.value})}/></label>
    {assetKind==='image'&&<div className="file-info"><span>{paper.asset?.width} × {paper.asset?.height} px · {paper.asset?.extension.toUpperCase()}</span></div>}
    <div className="file-info"><FileText size={14}/><span>{paper.fileName||'示例文献 · 可打开在线原文'}</span></div><div className="file-info"><Calendar size={13}/><span>添加于 {new Date(paper.addedAt).toLocaleDateString('zh-CN')}</span></div>
  </>}
  {text&&<><div className="inspector-eyebrow">灵感笔记</div><label className="field">笔记标题<input value={text.title} onChange={e=>update({title:e.target.value})}/></label><div className="field">卡片颜色<div className="swatches">{(['yellow','green','pink','white'] as const).map(c=><button key={c} className={`swatch note-${c} ${text.color===c?'active':''}`} title={{yellow:'麦芽黄',green:'鼠尾草绿',pink:'玫瑰粉',white:'纸白'}[c]} onClick={()=>update({color:c})}>{text.color===c&&<Check size={13}/>}</button>)}</div></div><label className="field">笔记内容</label><RichEditor id={node!.id} html={text.html} onChange={html=>update({html})}/></>}
  {edge&&<><div className="inspector-eyebrow">卡片关系</div><div className="edge-endpoints"><p>{nodes.find(n=>n.id===edge.source)?.data.title}</p><Link2 size={16}/><p>{nodes.find(n=>n.id===edge.target)?.data.title}</p></div><label className="field">关系名称<input value={edge.data?.relation||String(edge.label||'关联')} onChange={e=>updateEdge({...edge,label:e.target.value,data:{directed:edge.data?.directed??true,relation:e.target.value}})}/></label><label className="field">连接方向<select value={edge.data?.directed?'directed':'undirected'} onChange={e=>{const directed=e.target.value==='directed';updateEdge({...edge,data:{relation:edge.data?.relation||'关联',directed},markerEnd:directed?{type:'arrowclosed' as never,width:15,height:15,color:'#7b9d8a'}:undefined});}}><option value="directed">有向连接 →</option><option value="undirected">无向连接 —</option></select></label><p className="inspector-tip">为关系命名，让知识之间的联系更加清晰。点击画布中的连接线，随时编辑。</p></>}
  </div>}<div className="inspector-footer"><span><span className="tiny-dot"/> 已自动保存</span><button className="danger-text" onClick={remove}><Trash2 size={13}/> 删除{edge?'连接':'卡片'}</button></div></aside>;
}
