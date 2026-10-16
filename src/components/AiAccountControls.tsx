import { useEffect, useState } from 'react';
import { ExternalLink, LoaderCircle, LogOut, Plus, RefreshCw, X } from 'lucide-react';
import { useAi } from '../AiProvider';
import { aiJson, aiModels, aiRequest } from '../ai-backend';
import type { AiModel } from '../ai-types';
import CodexAccountControls from './CodexAccountControls';

export default function AiAccountControls({onModels}:{onModels:(models:AiModel[])=>void}){
  const {auth}=useAi();
  if(!auth)return <div className="ai-loading"><LoaderCircle size={15} className="spin"/>正在检测本机 AI 连接…</div>;
  return auth.provider==='codex'?<CodexAccountControls onModels={onModels}/>:<SiwcAccountControls onModels={onModels}/>;
}
function SiwcAccountControls({onModels}:{onModels:(models:AiModel[])=>void}){
  const {auth,refreshAuth,busy}=useAi();const [working,setWorking]=useState(false),[error,setError]=useState(''),[welcome,setWelcome]=useState(false);
  const account=auth?.accounts.find(item=>item.id===auth.activeId),connected=!!account?.connected;
  const models=async()=>{setError('');try{onModels((await aiModels()).models);}catch(error){onModels([]);setError((error as Error).message);}};
  useEffect(()=>{onModels([]);if(connected)void models();},[auth?.activeId,connected]);
  useEffect(()=>{if(!auth?.pending)return;const timer=setInterval(()=>void refreshAuth().catch(error=>setError(error.message)),1500);return()=>clearInterval(timer);},[auth?.pending,refreshAuth]);
  useEffect(()=>{if(!connected||!account)return;try{setWelcome(localStorage.getItem('paperly:ai-welcome:'+account.id)!=='seen');}catch{setWelcome(true);}},[connected,account?.id]);
  const action=async(path:string,value:unknown={})=>{setWorking(true);setError('');try{const result=await aiRequest<{revoked?:boolean}>(path,aiJson(value));await refreshAuth();if(result.revoked===false)setError('已在本地退出；未能确认远端撤销。可在 ChatGPT 设置中断开 Paperly。');}catch(error){setError((error as Error).message);}finally{setWorking(false);}};
  return <div className={`ai-account ${connected?'is-connected':''}`}>
    {connected?<details className="ai-account-menu"><summary><span className="ai-account-dot"/><span>{account?.email||account?.label}<small>使用 ChatGPT 套餐</small></span><span>⌄</span></summary><div className="ai-account-options"><label>当前连接的账号<select aria-label="ChatGPT 账号" disabled={working||busy.size>0} value={auth?.activeId||''} onChange={event=>void action('/auth/select',{id:event.target.value})}>{auth?.accounts.filter(item=>item.connected).map(item=><option key={item.id} value={item.id}>{item.label} · {item.email||item.id.slice(0,8)}</option>)}</select></label><button disabled={working||busy.size>0} onClick={()=>void action('/auth/start')}><Plus size={13}/>连接另一个账号</button><button disabled={working||busy.size>0} onClick={()=>void action('/auth/start',{accountId:account?.id})}><RefreshCw size={13}/>重新授权此账号</button><button disabled={working} onClick={()=>void models()}><RefreshCw size={13}/>刷新可用模型</button><button disabled={working} onClick={()=>void action('/auth/logout')}><LogOut size={13}/>断开此账号</button><a href="https://chatgpt.com/settings/usage" target="_blank" rel="noopener noreferrer"><ExternalLink size={13}/>管理套餐用量</a></div></details>:<div className="ai-connect-card"><b>连接你的 ChatGPT 套餐</b><p>仅 AI 功能需要授权。使用套餐额度，文献库继续免登录。</p><button className="ai-connect-button" disabled={working||auth?.pending} onClick={()=>void action('/auth/start',auth?.accounts[0]?{accountId:auth.accounts[0].id}:{})}>{working||auth?.pending?<LoaderCircle size={16} className="spin"/>:<span className="ai-brand-glyph" aria-hidden="true">◎</span>}Continue with ChatGPT</button>{!!auth?.accounts.length&&<button className="plain-button" disabled={working||auth?.pending} onClick={()=>void action('/auth/start')}>使用其他账号</button>}</div>}
    {auth?.pending&&<div className="ai-auth-pending"><LoaderCircle size={13} className="spin"/>{auth.phase==='verifying'?'正在完成授权验证…':'在系统浏览器中完成授权'}{auth.phase!=='verifying'&&<button className="plain-button" disabled={working} onClick={()=>void action('/auth/start',auth?.accounts[0]?{accountId:auth.accounts[0].id}:{})}>重新发起授权</button>}<button className="icon-button" title="取消连接" aria-label="取消 ChatGPT 连接" onClick={()=>void action('/auth/cancel')}><X size={13}/></button></div>}
    {welcome&&connected&&<div className="ai-plan-welcome"><span>已启用 ChatGPT 套餐。用量与你的现有额度共享，可随时管理。</span><button onClick={()=>{try{localStorage.setItem('paperly:ai-welcome:'+account!.id,'seen');}catch{}setWelcome(false);}}>知道了</button></div>}
    {(error||auth?.error)&&<p className="ai-inline-error" role="alert">{error||auth?.error}<a href="https://chatgpt.com/settings/usage" target="_blank" rel="noopener noreferrer">管理用量 / 连接</a></p>}
  </div>;
}
