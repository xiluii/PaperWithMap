import { useEffect, useRef, useState } from 'react';
import { ArrowUp, Check, Copy, FileText, LoaderCircle, Quote, Sigma, Sparkles, Square, StickyNote, X } from 'lucide-react';
import { useAi } from '../AiProvider';
import { createConversation, linkAnswerNote } from '../ai-backend';
import type { AiModel, ChatMessage, ReadingContext, SaveAiNote } from '../ai-types';
import type { NoteAnchor, PaperData } from '../types';
import { documentContext, formulaContext } from '../reading-context';
import type { ReadingSelection } from '../reading-context';
import { getAssetKind } from '../asset-model';
import AiAccountControls from './AiAccountControls';
import AiMarkdown from './AiMarkdown';
import { effortLabel } from '../ai-preferences';

type Props={conversationId:string|null;onConversation:(id:string)=>void;source?:{paper:PaperData;anchor:NoteAnchor};selection?:ReadingSelection|null;onClearSelection?:()=>void;getWordText?:()=>Promise<string>;onSaveNote:SaveAiNote};
export default function AiChatPanel({conversationId,onConversation,source,selection,onClearSelection,getWordText,onSaveNote}:Props){
  const ai=useAi(),conversation=conversationId?ai.conversations[conversationId]:undefined;
  const [models,setModels]=useState<AiModel[]>([]),[draft,setDraft]=useState(''),[error,setError]=useState(''),[preparing,setPreparing]=useState(false),[loading,setLoading]=useState(false),[saving,setSaving]=useState<string|null>(null),[copied,setCopied]=useState('');
  const modelInfo=models.find(item=>item.id===ai.preferences.model)||models[0],model=modelInfo?.id||'';
  const efforts=modelInfo?.supportedReasoningEfforts||[],preferredEffort=ai.preferences.efforts[model];
  const effort=efforts.some(option=>option.reasoningEffort===preferredEffort)?preferredEffort:'';
  const [scope,setScope]=useState<'document'|'selection'|'saved'>('document');
  const thread=useRef<HTMLDivElement>(null),pinned=useRef(true),textarea=useRef<HTMLTextAreaElement>(null),composing=useRef(false);
  const busy=!!conversationId&&ai.busy.has(conversationId),connected=!ai.auth?.pending&&ai.auth?.accounts.some(account=>account.id===ai.auth?.activeId&&account.connected&&account.planEnabled);
  const messages=conversation?.messages||[],last=messages.at(-1);
  useEffect(()=>{if(!conversationId){setDraft('');setError('');setScope(selection?'selection':'document');return;}let live=true;setLoading(true);setError('');ai.load(conversationId).then(()=>{if(live)setScope(selection?'selection':'saved');}).catch(error=>{if(live)setError(error.message);}).finally(()=>{if(live)setLoading(false);});return()=>{live=false;};},[conversationId,ai.load]);
  useEffect(()=>{if(selection){setScope('selection');textarea.current?.focus({preventScroll:true});}},[selection]);
  useEffect(()=>{if(pinned.current)thread.current?.scrollTo({top:thread.current.scrollHeight,behavior:'instant'});},[last?.text,messages.length,conversationId]);
  useEffect(()=>{pinned.current=true;},[conversationId]);
  const send=async(prompt=draft,action?:'summary'|'formula'|'selection')=>{
    if(busy||preparing||!prompt.trim())return;
    if(!connected){setError('请先连接 ChatGPT 并允许使用套餐额度。');return;}if(!model){setError('请先选择可用模型；如果列表为空，可在账号菜单中刷新。');return;}
    setPreparing(true);setError('');
    try{
      let context:ReadingContext|null=null;
      if(action==='selection'){if(!selection)throw new Error('请先选中需要提问的段落');context={kind:'selection',text:selection.text,page:selection.page};}
      else if(action==='formula'){
        if(selection)context=formulaContext(selection);
        else if(source&&['pdf','presentation'].includes(getAssetKind(source.paper)))context=formulaContext(null);
        else if(source&&getAssetKind(source.paper)==='image')context=await documentContext(source.paper);
        else throw new Error('请先选中公式，或将公式粘贴到输入框后提问。');
      }else if(source&&(action==='summary'||scope==='document'))context=await documentContext(source.paper,getWordText);
      else if(selection&&scope==='selection')context={kind:'selection',text:selection.text,page:selection.page};
      let id=conversationId;
      if(!id){if(!source)throw new Error('请从文献阅读页新建对话');const created=await createConversation(source.paper.fileId!,source.anchor);ai.put(created);ai.changed();id=created.id;onConversation(id);}
      setDraft('');setPreparing(false);const success=await ai.send(id,prompt.trim(),model,context,effort||undefined);if(!success)setDraft(prompt);
      else{onClearSelection?.();setScope('saved');}
    }catch(error){setError((error as Error).message);}finally{setPreparing(false);}
  };
  const save=async(message:ChatMessage)=>{if(!conversation)return;setSaving(message.id);setError('');try{const anchor=await onSaveNote(conversation,message);ai.put(await linkAnswerNote(conversation.id,message.id,anchor));ai.changed();}catch(error){setError((error as Error).message);}finally{setSaving(null);}};
  return <section className="ai-chat-panel" aria-label="文献 AI 对话"><AiAccountControls onModels={setModels}/>
    <div ref={thread} className="ai-thread" aria-label="对话消息" onScroll={()=>{const element=thread.current;if(element)pinned.current=element.scrollHeight-element.scrollTop-element.clientHeight<100;}}>
      {loading&&!conversation?<div className="ai-loading"><LoaderCircle size={18} className="spin"/>正在读取本地对话…</div>:!messages.length?<div className="ai-conversation-empty"><span className="ai-empty-icon"><Sparkles size={23}/></span><h3>{source?'和这篇文献聊一聊':'继续你的研究思考'}</h3><p>{source?'梳理文章脉络，理解推导，留住新的想法。':'选择模型，在下方继续提问。'}</p>{source&&<div className="ai-source-caption"><FileText size={15}/><span>{source.paper.title}</span></div>}<small>对话保存在本机 · 发送的内容联网传给 OpenAI</small></div>:messages.map(message=><article className={`ai-message ${message.role}`} key={message.id}><div className="ai-message-byline">{message.role==='assistant'?<><Sparkles size={13}/><b>阅读助手</b><span>{models.find(model=>model.id===message.model)?.name||message.model}</span></>:<><span className="ai-you-avatar">你</span><b>我的提问</b></>}<time dateTime={message.createdAt}>{new Date(message.createdAt).toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit'})}</time></div>
      {message.contextLabel&&<div className="ai-message-source"><Quote size={11}/>{message.contextLabel.kind==='document'?`全文 · ${message.contextLabel.pages?message.contextLabel.pages+' 页 · ':''}${message.contextLabel.characters.toLocaleString()} 字符`:message.contextLabel.kind==='selection'?`选中文字${message.contextLabel.page?' · 第 '+message.contextLabel.page+' 页':''}`:message.contextLabel.kind==='page'?`第 ${message.contextLabel.page} 页截图`:'图片内容'}</div>}
      {message.context?.text&&<details className="ai-quoted-context"><summary>查看引用内容</summary><p>{message.context.text}</p></details>}
      {message.role==='assistant'?<>{message.effort&&<span className="ai-effort-badge">推理强度 · {effortLabel(message.effort)}</span>}<AiMarkdown text={message.text}/>{busy&&message.status==='streaming'&&<div className="ai-stream-status" role="status"><span className="ai-stream-dot"/>{message.text?'正在输出…':'正在思考…'}</div>}</>:<p className="ai-question-text">{message.text}</p>}
      {message.error&&<p className="ai-message-error" role="status">{message.error}</p>}
      {message.role==='assistant'&&message.text&&<div className="ai-message-actions"><button title="复制回答" aria-label="复制回答" onClick={()=>void navigator.clipboard.writeText(message.text).then(()=>{setCopied(message.id);setTimeout(()=>setCopied(''),1800);}).catch(()=>setError('复制失败，请手动选择文字复制'))}>{copied===message.id?<Check size={13}/>:<Copy size={13}/>}复制</button><button disabled={busy||saving!==null} className={message.noteAnchor?'saved':''} onClick={()=>void save(message)}>{saving===message.id?<LoaderCircle size={13} className="spin"/>:message.noteAnchor?<Check size={13}/>:<StickyNote size={13}/>} {message.noteAnchor?'已保存为关联笔记':'保存为关联笔记'}</button></div>}</article>)}
    </div>
    {(error||(conversationId&&ai.errors[conversationId]))&&<div className="ai-panel-error" role="alert">{error||(conversationId&&ai.errors[conversationId])}<button className="icon-button" title="关闭提示" aria-label="关闭 AI 提示" onClick={()=>{setError('');if(conversationId)ai.clearError(conversationId);}}><X size={12}/></button></div>}
    <div className="ai-composer-area">{source&&<div className="ai-quick-actions"><button disabled={busy||preparing} onClick={()=>void send(getAssetKind(source.paper)==='image'?'请分析这张图片，概述主要信息，并指出值得进一步关注的细节。':'请通读这篇文献，按研究问题、方法、主要结果、局限性和可借鉴之处进行总结，并标注相关页码。','summary')}><FileText size={13}/>{getAssetKind(source.paper)==='image'?'解读图片':'全文总结'}</button><button disabled={busy||preparing} onClick={()=>void send('请解释资料中的公式，说明每个符号、成立条件、推导过程与直观含义。','formula')}><Sigma size={14}/>解释公式</button>{selection&&<button disabled={busy||preparing} onClick={()=>void send('请解释选中段落的含义、在文章中的作用，以及理解它所需的背景知识。','selection')}><Quote size={13}/>解释选区</button>}</div>}
      {selection&&<div className="ai-selection-chip"><Quote size={13}/><span>{selection.text}</span><button className="icon-button" title="清除选区" aria-label="清除引用选区" onClick={()=>{onClearSelection?.();setScope(conversation?'saved':'document');}}><X size={12}/></button></div>}
      <form className="ai-composer" onSubmit={event=>{event.preventDefault();void send();}}><textarea ref={textarea} aria-label="向文献 AI 提问" placeholder={connected?'向这篇文献提问…':'连接 ChatGPT 后开始提问…'} value={draft} maxLength={20000} rows={3} onChange={event=>setDraft(event.target.value)} onCompositionStart={()=>{composing.current=true;}} onCompositionEnd={()=>{composing.current=false;}} onKeyDown={event=>{if(event.key==='Enter'&&!event.shiftKey&&!event.nativeEvent.isComposing&&!composing.current){event.preventDefault();void send();}}}/>
        <div className="ai-composer-options"><div>
          <select aria-label="AI 模型" value={model} onChange={event=>ai.setPreference(event.target.value)} disabled={!models.length||busy||preparing}>{!models.length&&<option value="">{connected?'等待可用模型':'未连接模型'}</option>}{models.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select>
          {!!efforts.length&&<label className="ai-effort-control">推理<select aria-label="推理强度" title="更高的推理强度通常需要更长时间。可选档位由当前模型提供。" value={effort} disabled={busy||preparing} onChange={event=>ai.setPreference(model,event.target.value)}><option value="">模型默认{modelInfo?.defaultReasoningEffort?` · ${effortLabel(modelInfo.defaultReasoningEffort)}`:''}</option>{efforts.map(option=><option key={option.reasoningEffort} value={option.reasoningEffort} title={option.description}>{effortLabel(option.reasoningEffort)}</option>)}</select></label>}
          {source&&<select aria-label="发送的文献范围" value={scope} disabled={busy||preparing} onChange={event=>setScope(event.target.value as typeof scope)}>{conversation&&<option value="saved">沿用对话上下文</option>}<option value="document">{getAssetKind(source.paper)==='image'?'当前图片':'整篇文献'}</option>{selection&&<option value="selection">选中文字</option>}</select>}
        </div>{busy?<button type="button" className="ai-send-button stopping" title="停止回答" aria-label="停止回答" onClick={()=>void ai.stop(conversationId!).catch(error=>setError(error.message))}><Square size={13}/></button>:<button type="submit" className="ai-send-button" title="发送提问" aria-label="发送提问" disabled={preparing||!draft.trim()}>{preparing?<LoaderCircle size={15} className="spin"/>:<ArrowUp size={16}/>}</button>}</div>
      </form><div className="ai-composer-footnote"><span>{preparing?'正在读取文献内容…':busy?`${last?.text?'正在流式输出':'正在思考'} · 已生成内容保存在本地`:'Enter 发送 · Shift + Enter 换行'}</span><a href="https://chatgpt.com/settings/usage" target="_blank" rel="noopener noreferrer">管理用量</a></div>
    </div>
  </section>;
}
