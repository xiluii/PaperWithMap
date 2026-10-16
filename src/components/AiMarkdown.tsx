import Markdown from 'react-markdown';
import type { Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { Children, isValidElement, memo, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Check, Copy } from 'lucide-react';
import { remarkCjkEmphasis } from '../ai-markdown-plugins';
import 'katex/dist/katex.min.css';

function codeText(value:ReactNode):string{
  return Children.toArray(value).map(child=>isValidElement<{children?:ReactNode}>(child)?codeText(child.props.children):typeof child==='string'||typeof child==='number'?String(child):'').join('');
}
function CodeBlock({children,interactive}:{children:ReactNode;interactive:boolean}){
  const [copied,setCopied]=useState(false),[failed,setFailed]=useState(false),timer=useRef<ReturnType<typeof setTimeout>|undefined>(undefined);
  useEffect(()=>()=>clearTimeout(timer.current),[]);
  const element=Children.toArray(children).find(child=>isValidElement(child));
  const code=isValidElement<{className?:string}>(element)?element.props:null;
  const language=code?.className?.match(/language-([\w+-]+)/)?.[1]||'text';
  const value=codeText(children).replace(/\n$/,'');
  const copy=async()=>{try{await navigator.clipboard.writeText(value);setCopied(true);setFailed(false);clearTimeout(timer.current);timer.current=setTimeout(()=>setCopied(false),1800);}catch{setFailed(true);}};
  return <div className="ai-code-block"><div className="ai-code-heading"><span>{language}</span>{interactive&&<button type="button" aria-label="复制代码" onClick={()=>void copy()}>{copied?<Check size={13} aria-hidden="true"/>:<Copy size={13} aria-hidden="true"/>}{copied?'已复制':failed?'复制失败，请手动选择':'复制代码'}</button>}</div><pre>{children}</pre></div>;
}
const components:Components={a:({node:_,...props})=><a {...props} target="_blank" rel="noopener noreferrer"/>,img:({alt})=><span className="ai-image-placeholder">[{alt||'图片'}]</span>,pre:({children})=><CodeBlock interactive={false}>{children}</CodeBlock>,table:({children})=><div className="ai-table-scroll" role="region" aria-label="数据表格" tabIndex={0}><table>{children}</table></div>};
const interactiveComponents:Components={...components,pre:({children})=><CodeBlock interactive>{children}</CodeBlock>};
function AiMarkdown({text,interactive=false}:{text:string;interactive?:boolean}){
  return <div className="ai-markdown"><Markdown skipHtml remarkPlugins={[remarkGfm,remarkMath,remarkCjkEmphasis]} rehypePlugins={[[rehypeKatex,{throwOnError:false,strict:'ignore',trust:false}]]} components={interactive?interactiveComponents:components}>{text}</Markdown></div>;
}
export default memo(AiMarkdown);
