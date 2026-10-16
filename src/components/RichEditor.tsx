import { useEffect, useRef } from 'react';
import { Bold, Italic, List, ListOrdered, Highlighter, Underline } from 'lucide-react';
import DOMPurify from 'dompurify';

export default function RichEditor({id,html,onChange}:{id:string;html:string;onChange:(html:string)=>void}){
  const editor=useRef<HTMLDivElement>(null);
  const range=useRef<Range|null>(null);
  useEffect(()=>{if(editor.current)editor.current.innerHTML=DOMPurify.sanitize(html);},[id]); // Keep the caret stable while typing.
  const remember=()=>{const selection=window.getSelection();if(selection?.rangeCount&&editor.current?.contains(selection.anchorNode))range.current=selection.getRangeAt(0).cloneRange();};
  const command=(name:string,value?:string)=>{editor.current?.focus();if(range.current){const sel=window.getSelection();sel?.removeAllRanges();sel?.addRange(range.current);}document.execCommand(name,false,value);remember();if(editor.current)onChange(DOMPurify.sanitize(editor.current.innerHTML));};
  return <div className="rich-editor"><div className="rich-toolbar">
    <select title="字体" aria-label="字体" defaultValue="sans-serif" onChange={e=>command('fontName',e.target.value)}><option value="sans-serif">默认字体</option><option value="Georgia">衬线字体</option><option value="monospace">等宽字体</option></select>
    <select title="字号" aria-label="字号" defaultValue="3" onChange={e=>command('fontSize',e.target.value)}><option value="2">小</option><option value="3">中</option><option value="4">大</option><option value="5">特大</option></select>
    <div className="rich-buttons">{[['bold',Bold,'加粗'],['italic',Italic,'斜体'],['underline',Underline,'下划线'],['insertUnorderedList',List,'项目列表'],['insertOrderedList',ListOrdered,'编号列表']].map(([cmd,Icon,label])=>{const I=Icon as typeof Bold;return <button key={String(cmd)} title={String(label)} aria-label={String(label)} onMouseDown={e=>e.preventDefault()} onClick={()=>command(String(cmd))}><I size={15}/></button>;})}<button title="高亮" aria-label="高亮" onMouseDown={e=>e.preventDefault()} onClick={()=>command('hiliteColor','#f5e38a')}><Highlighter size={15}/></button><label className="font-color" title="字色">A<input type="color" aria-label="字色" defaultValue="#334839" onChange={e=>command('foreColor',e.target.value)}/></label></div>
  </div><div ref={editor} className="rich-editable" contentEditable suppressContentEditableWarning role="textbox" aria-label="笔记正文" aria-multiline="true" onKeyUp={remember} onMouseUp={remember} onBlur={remember} onInput={()=>{remember();if(editor.current)onChange(DOMPurify.sanitize(editor.current.innerHTML));}}/><div className="editor-hint">选中文字即可调整样式 · 自动保存</div></div>;
}
