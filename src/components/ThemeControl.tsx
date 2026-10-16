import { useEffect, useId, useRef, useState } from 'react';
import { Check, Monitor, Moon, Sun } from 'lucide-react';
import { useTheme } from '../ThemeProvider';
import type { ThemePreference } from '../ThemeProvider';

const options = [{ value: 'light', label: '浅色模式', icon: Sun }, { value: 'dark', label: '暗色模式', icon: Moon }, { value: 'system', label: '跟随系统', icon: Monitor }] as const;
export default function ThemeControl() {
  const { preference, theme, setPreference } = useTheme();
  const [open, setOpen] = useState(false), id = useId();
  const root = useRef<HTMLDivElement>(null), trigger = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    const escape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault(); event.stopPropagation(); setOpen(false); trigger.current?.focus();
    };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape, true);
    return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', escape, true); };
  }, [open]);
  const select = (value: ThemePreference) => { setPreference(value); setOpen(false); trigger.current?.focus(); };
  return <div ref={root} className="theme-control">
    <button ref={trigger} type="button" className="theme-trigger" aria-label="外观主题" aria-expanded={open} aria-controls={id} title={`外观主题 · ${options.find(item => item.value === preference)?.label}`} onClick={() => setOpen(value => !value)}>{theme === 'dark' ? <Moon size={16}/> : <Sun size={16}/>}</button>
    {open && <div id={id} className="theme-popover" role="group" aria-label="选择外观主题"><span className="theme-caption">外观主题</span>{options.map(({ value, label, icon: Icon }) => <button type="button" key={value} aria-pressed={preference === value} onClick={() => select(value)}><Icon size={15}/><span>{label}</span>{preference === value && <Check size={14}/>}</button>)}<small>仅调整显示，不改变文件内容</small></div>}
  </div>;
}
