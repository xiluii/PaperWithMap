import { Maximize, Minimize2 } from 'lucide-react';

export default function FocusModeButton({focused,onToggle,label}:{focused:boolean;onToggle:()=>void;label:string}){
  return <button className={`focus-mode-button ${focused?'is-focused':''}`}
    aria-label={focused?'退出专注模式':label} aria-pressed={focused}
    title={focused?'退出专注模式 (Shift+F / Esc)':`${label} (Shift+F)`} onClick={onToggle}>
    {focused?<Minimize2 size={15}/>:<Maximize size={15}/>}
    <span>{focused?'退出专注':label}</span>
  </button>;
}
