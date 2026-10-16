import { ChevronDown, FileText, Image, Maximize2, Minus, Plus, RotateCcw, Settings2 } from 'lucide-react';
import { useState } from 'react';
import type { AssetKind,CardAppearance, CardField } from '../types';
import { availableFields } from '../asset-model';
import { MAX_CARD_SCALE, MIN_CARD_SCALE, resolveCardAppearance } from '../card-model';

type Props={value?:CardAppearance;defaults?:CardAppearance;kind:'paper'|'text'|'all';assetKind?:AssetKind;onChange:(patch:CardAppearance)=>void;onReset:()=>void;onStart:()=>void;onEnd:()=>void;isDefault?:boolean};
const fields:{id:CardField;label:string;description:string}[]=[
  {id:'authors',label:'作者',description:'论文作者或研究团队'},
  {id:'year',label:'发表年份',description:'卡片顶部的年份标签'},
  {id:'tags',label:'关键词 / 标签',description:'展示文献的关键词'},
  {id:'preview',label:'图片预览',description:'展示文件封面或图片缩略图'},
  {id:'status',label:'阅读状态',description:'待读、阅读中或已读'},
  {id:'venue',label:'期刊 / 会议',description:'文献的发表来源'},
  {id:'abstract',label:'摘要',description:'展示摘要的前几行'},
  {id:'content',label:'文字卡片正文',description:'展示文字卡片的富文本内容'},
  {id:'remark',label:'备注',description:'展示文件备注'},
  {id:'dimensions',label:'图片尺寸',description:'展示图片宽度与高度'},
];
export default function CardAppearanceSettings({value,defaults,kind,assetKind='pdf',onChange,onReset,onStart,onEnd,isDefault=false}:Props){
  const resolved=resolveCardAppearance(value,defaults);
  const [more,setMore]=useState(false);
  const visibleFields=fields.filter(f=>kind==='all'||(kind==='text'?f.id==='content':availableFields(assetKind).includes(f.id)&&(more||['authors','tags','preview','remark','dimensions'].includes(f.id))));
  const custom=!!value&&(value.scale!==undefined||Object.keys(value.fields||{}).length>0);
  return <div className="card-appearance-settings"><div className="card-settings-intro"><span><Settings2 size={16}/></span><div><b>{isDefault?'白板上的默认展示':'让卡片只展示你需要的信息'}</b><p>{isDefault?'本白板已有和新建的卡片会沿用这些设置，单独设置过的项目保留。':'单卡独立设置，原始资料完整保留。'}</p></div></div>
    <div className="card-settings-section"><div className="card-settings-caption"><FileText size={13}/><span>显示内容</span><small>标题始终显示</small></div><div className="card-field-options">{visibleFields.map(field=><label key={field.id} className="card-field-option"><span><b>{field.label}</b><small>{field.description}</small></span><input type="checkbox" aria-label={`${isDefault?'默认显示':'显示'}${field.label}`} checked={resolved.fields[field.id]} onChange={event=>onChange({fields:{[field.id]:event.target.checked}})}/></label>)}</div>{kind==='paper'&&<button className="card-more-fields" aria-expanded={more} onClick={()=>setMore(v=>!v)}>{more?'收起更多选项':'更多显示选项'}<ChevronDown size={12}/></button>}</div>
    <div className="card-settings-section"><div className="card-settings-caption"><Maximize2 size={13}/><span>卡片缩放</span><strong>{Math.round(resolved.scale*100)}%</strong></div><div className="card-scale-control"><button className="icon-button" aria-label="缩小卡片" disabled={resolved.scale<=MIN_CARD_SCALE} onClick={()=>onChange({scale:resolved.scale-.1})}><Minus size={15}/></button><input type="range" min={MIN_CARD_SCALE*100} max={MAX_CARD_SCALE*100} step="1" value={Math.round(resolved.scale*100)} aria-label={isDefault?'默认卡片缩放':'卡片缩放'} onPointerDown={onStart} onPointerUp={onEnd} onPointerCancel={onEnd} onBlur={onEnd} onKeyDown={event=>{if(['ArrowLeft','ArrowRight','Home','End'].includes(event.key))onStart();}} onKeyUp={onEnd} onChange={event=>onChange({scale:Number(event.target.value)/100})}/><button className="icon-button" aria-label="放大卡片" disabled={resolved.scale>=MAX_CARD_SCALE} onClick={()=>onChange({scale:resolved.scale+.1})}><Plus size={15}/></button></div><div className="card-scale-marks"><span>60%</span><button onClick={()=>onChange({scale:1})}>100%</button><span>200%</span></div><p className="card-scale-hint"><Image size={12}/>文字和预览一同缩放，也可拖动卡片右下角。</p></div>
    <button className="secondary-button card-settings-reset" disabled={!isDefault&&!custom} onClick={onReset}><RotateCcw size={13}/>{isDefault?'恢复初始默认设置':'恢复白板默认设置'}</button>
  </div>;
}
