import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';

export default function AiMarkdown({text}:{text:string}){
  return <div className="ai-markdown"><Markdown remarkPlugins={[remarkGfm,remarkMath]} rehypePlugins={[[rehypeKatex,{throwOnError:false,strict:'ignore',trust:false}]]} components={{a:props=><a {...props} target="_blank" rel="noopener noreferrer"/>,img:({alt})=><span className="ai-image-placeholder">[{alt||'图片'}]</span>}}>{text}</Markdown></div>;
}
