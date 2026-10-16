import { useEffect, useState } from 'react';
import type { KeyboardEvent } from 'react';

export default function useFocusMode(scope:'note'|'split-note'|'reader',beforeChange?:()=>void){
  const key=`paperly:${scope}-focus`;
  const [focused,setFocused]=useState(()=>{try{return localStorage.getItem(key)==='true';}catch{return false;}});
  useEffect(()=>{try{localStorage.setItem(key,String(focused));}catch{/* Focus mode also works without preference storage. */}},[key,focused]);
  const toggle=()=>{beforeChange?.();setFocused(value=>!value);};
  const onKeyDown=(event:KeyboardEvent<HTMLElement>)=>{
    const target=event.target as HTMLElement;
    // Nested dialogs keep their own Escape and text-entry behavior.
    if(event.defaultPrevented||target.closest('[role="dialog"]')!==event.currentTarget.closest('[role="dialog"]'))return;
    if(event.key==='Escape'&&focused){
      event.preventDefault();event.stopPropagation();beforeChange?.();setFocused(false);
      event.currentTarget.focus({preventScroll:true});
    }else if(event.shiftKey&&!event.ctrlKey&&!event.metaKey&&!event.altKey&&event.key.toLowerCase()==='f'
      &&!target.isContentEditable&&!target.closest('input,textarea,select,[contenteditable="true"]')){
      event.preventDefault();event.stopPropagation();toggle();
      event.currentTarget.focus({preventScroll:true});
    }
  };
  return {focused,toggle,onKeyDown};
}
