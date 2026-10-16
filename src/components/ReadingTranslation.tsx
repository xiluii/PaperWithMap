import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { MutableRefObject, ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { BookOpen, ExternalLink, Languages, LoaderCircle, Quote, RotateCw, X } from 'lucide-react';
import { dictionaryQuery, dictionarySelectionError, lookupDictionary } from '../dictionary';
import type { DictionaryEntry } from '../dictionary';
import type { ReadingSelection } from '../reading-context';

const preferenceKey = 'paperly:reading-translation';
type TranslationContext = {
  enabled: boolean; toggle: () => void;
  askAi: MutableRefObject<((selection: ReadingSelection) => void) | null>;
  reportWordSelection: (text: string | null, mount: Element) => void;
  translateSelection: (selection: Selection) => void;
};
const Context = createContext<TranslationContext | null>(null);
export const useReadingTranslation = () => useContext(Context);
type Selection = { text: string; rect: DOMRect; root: Element; page?: number };
type Result = { entry?: DictionaryEntry; error?: string; loading?: boolean };

export function ReadingTranslationProvider({ children }: { children: ReactNode }) {
  const [enabled, setEnabled] = useState(() => { try { return localStorage.getItem(preferenceKey) === 'true'; } catch { return false; } });
  const [selection, setSelection] = useState<Selection | null>(null), [result, setResult] = useState<Result>({});
  const pending = useRef<AbortController | null>(null), askAi = useRef<((selection: ReadingSelection) => void) | null>(null);
  const wordPointer = useRef<DOMRect | null>(null);
  const enabledRef = useRef(enabled), selectionRef = useRef(selection);
  enabledRef.current = enabled; selectionRef.current = selection;
  const dismiss = useCallback(() => {
    if (!pending.current && !selectionRef.current) return;
    pending.current?.abort(); pending.current = null; selectionRef.current = null; setSelection(null); setResult({});
  }, []);
  const translateSelection = useCallback((next: Selection) => {
    if (!enabledRef.current) return;
    pending.current?.abort(); selectionRef.current = next;
    setResult({ loading: true }); setSelection(next);
  }, []);
  const reportWordSelection = useCallback((value: string | null, mount: Element) => {
    if (!enabledRef.current) return;
    const text = dictionaryQuery(value || ''), root = mount.closest('.paper-reader-modal');
    if (!text || !root) { dismiss(); return; }
    const run = [...mount.querySelectorAll('.superdoc-text-run')].find(element => element.textContent?.includes(value!.trim()) && element.getBoundingClientRect().width > 1);
    const rect = wordPointer.current || run?.getBoundingClientRect();
    if (!rect) return;
    pending.current?.abort(); const next = { text, root, rect };
    selectionRef.current = next; setResult({ loading: true }); setSelection(next);
  }, [dismiss]);
  const toggle = () => {
    const next = !enabledRef.current; enabledRef.current = next;
    dismiss(); setEnabled(next);
    try { localStorage.setItem(preferenceKey, String(next)); } catch { /* The switch also works without browser storage. */ }
  };
  useEffect(() => {
    if (!enabled) return;
    const capture = (event: Event) => {
      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest('.reading-translation-popover,.reading-translation-toggle')) return;
      if (target?.closest('.word-editor-mount')) return; // SuperDoc owns its selection; use its read-only selection API.
      if (!target?.closest('.paper-pdf-pane') || target.closest('button,input,textarea,select,.pdf-ink-overlay,.pdf-place-layer')) { dismiss(); return; }
      if (event instanceof KeyboardEvent && !['Shift', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'a', 'A'].includes(event.key)) return;
      const selected = window.getSelection();
      if (!selected || selected.isCollapsed || !selected.rangeCount) { dismiss(); return; }
      const range = selected.getRangeAt(0);
      const element = (node: Node) => node instanceof Element ? node : node.parentElement;
      const start = element(range.startContainer), end = element(range.endContainer);
      const scope = start?.closest('.paper-pdf-pane .pdf-selectable-text,.asset-content-pane .word-editor-mount');
      const root = scope?.closest('.paper-reader-modal');
      if (!root || !end || !root.contains(end) || !end.closest('.paper-pdf-pane .pdf-selectable-text,.asset-content-pane .word-editor-mount') || start?.closest('button,input,textarea,.word-formatting-toolbar')) { dismiss(); return; }
      const text = dictionaryQuery(selected.toString()), rect = range.getBoundingClientRect();
      if (!text || !rect.width || !rect.height) { dismiss(); return; }
      if (selectionRef.current?.text === text && selectionRef.current.root === root) return;
      pending.current?.abort();
      const page = Number(start?.closest('[data-pdf-page]')?.getAttribute('data-pdf-page')) || undefined;
      const next = { text, rect, root, page }; selectionRef.current = next;
      setResult({ loading: true }); setSelection(next);
    };
    const outside = (event: PointerEvent) => {
      if (!(event.target instanceof Element) || event.target.closest('.reading-translation-popover,.reading-translation-toggle')) return;
      wordPointer.current = event.target.closest('.word-editor-mount') ? new DOMRect(event.clientX, event.clientY, 1, 10) : null;
      dismiss();
    };
    const scroll = (event: Event) => { if (!(event.target instanceof Element) || !event.target.closest('.reading-translation-popover')) dismiss(); };
    const key = (event: KeyboardEvent) => { if (event.key === 'Escape' && selectionRef.current) { event.preventDefault(); event.stopPropagation(); dismiss(); } else if (event.target instanceof Element && event.target.closest('.word-editor-mount')) wordPointer.current = null; };
    document.addEventListener('pointerup', capture);
    document.addEventListener('keyup', capture);
    document.addEventListener('pointerdown', outside, true);
    document.addEventListener('scroll', scroll, true);
    document.addEventListener('keydown', key, true);
    document.addEventListener('contextmenu', dismiss, true);
    window.addEventListener('resize', dismiss);
    return () => {
      document.removeEventListener('pointerup', capture); document.removeEventListener('keyup', capture);
      document.removeEventListener('pointerdown', outside, true); document.removeEventListener('scroll', scroll, true);
      document.removeEventListener('keydown', key, true); window.removeEventListener('resize', dismiss);
      document.removeEventListener('contextmenu', dismiss, true);
    };
  }, [enabled, dismiss]);
  useEffect(() => {
    if (!enabled || !selection) return;
    const controller = new AbortController(); pending.current = controller;
    const error = dictionarySelectionError(selection.text);
    if (error) { setResult({ error }); return () => controller.abort(); }
    // Wait for selection to settle; replacing the selection or switching off cancels the request.
    const timer = window.setTimeout(() => {
      void lookupDictionary(selection.text, controller.signal).then(entry => {
        if (!controller.signal.aborted && enabledRef.current) setResult({ entry });
      }).catch(error => { if (!controller.signal.aborted && enabledRef.current) setResult({ error: (error as Error).message }); });
    }, 180);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [enabled, selection]);
  useEffect(() => () => pending.current?.abort(), []);
  return <Context.Provider value={{ enabled, toggle, askAi, reportWordSelection, translateSelection }}>{children}{enabled && selection && createPortal(
    <TranslationPopover selection={selection} result={result} onClose={dismiss} onRetry={() => { setResult({ loading: true }); setSelection({ ...selection }); }} onAskAi={askAi.current ? () => { askAi.current?.({ text: selection.text, x: selection.rect.left, y: selection.rect.bottom + 7, page: selection.page }); dismiss(); } : undefined} />,
    selection.root,
  )}</Context.Provider>;
}

export function ReadingTranslationToggle() {
  const translation = useReadingTranslation();
  if (!translation) return null;
  return <button type="button" role="switch" aria-checked={translation.enabled} aria-label="划词翻译" className={`reading-translation-toggle ${translation.enabled ? 'is-enabled' : ''}`} onClick={translation.toggle} title={translation.enabled ? '关闭划词翻译；仅将选中词句发送给有道词典，不使用 GPT' : '开启划词翻译；选中的单词或短语将联网查询有道词典'}><Languages size={15} /><span>划词翻译</span><i aria-hidden="true"><b /></i></button>;
}

function TranslationPopover({ selection, result, onClose, onRetry, onAskAi }: { selection: Selection; result: Result; onClose: () => void; onRetry: () => void; onAskAi?: () => void }) {
  const panel = useRef<HTMLDivElement>(null), [position, setPosition] = useState({ left: 12, top: 12 });
  useLayoutEffect(() => {
    const bounds = panel.current?.getBoundingClientRect(); if (!bounds) return;
    const left = Math.max(12, Math.min(selection.rect.left, window.innerWidth - bounds.width - 12));
    const below = selection.rect.bottom + 10;
    const top = below + bounds.height <= window.innerHeight - 12 ? below : Math.max(12, selection.rect.top - bounds.height - 10);
    setPosition({ left, top });
  }, [selection, result]);
  const entry = result.entry;
  return <div ref={panel} className="reading-translation-popover" role="region" aria-label="划词翻译结果" style={position} onPointerDown={event => { if ((event.target as Element).closest('button,a')) event.preventDefault(); }}>
    <div className="translation-heading"><span><BookOpen size={14} />有道词典</span><button className="icon-button" aria-label="关闭翻译结果" title="关闭翻译结果 (Esc)" onClick={onClose}><X size={15} /></button></div>
    <div className="translation-content" aria-live="polite" aria-busy={!!result.loading}><strong className="translation-headword">{entry?.headword || (selection.text.length > 160 ? selection.text.slice(0, 160) + '…' : selection.text)}</strong>
      {entry && <div className="translation-pronunciation">{entry.pronunciations.uk && <span>英 /{entry.pronunciations.uk}/</span>}{entry.pronunciations.us && <span>美 /{entry.pronunciations.us}/</span>}{entry.pronunciations.other && <span>{entry.pronunciations.other}</span>}</div>}
      {result.loading && <p className="translation-loading"><LoaderCircle size={15} className="spin" />正在查询词典…</p>}
      {result.error && <p className="translation-error" role="alert">{result.error}</p>}
      {entry?.found && <ul className="translation-definitions">{entry.definitions.map((line, index) => <li key={index}>{line}</li>)}</ul>}
      {entry && !entry.found && <p className="translation-empty">未收录这个词条。试试单个词或更短的短语。</p>}
    </div>
    <div className="translation-actions">{result.error && !dictionarySelectionError(selection.text) && <button onClick={onRetry}><RotateCw size={13} />重试</button>}{onAskAi && <button onClick={onAskAi}><Quote size={13} />向 AI 提问</button>}{entry && <a href={entry.url} target="_blank" rel="noopener noreferrer">完整词条<ExternalLink size={12} /></a>}<span>词典查询 · 无需 GPT</span></div>
  </div>;
}
