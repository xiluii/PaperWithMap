import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { AiStatus, Conversation, ReadingContext } from './ai-types';
import { aiJson, aiRequest, aiStatus, getConversation, streamAnswer } from './ai-backend';
import { readAiPreferences, writeAiPreferences } from './ai-preferences';
import type { AiPreferences } from './ai-preferences';

type State={conversations:Record<string,Conversation>;busy:Set<string>;errors:Record<string,string>;version:number;auth:AiStatus|null};
type Controller=State&{preferences:AiPreferences;setPreference:(model:string,effort?:string)=>void;load:(id:string)=>Promise<Conversation>;put:(value:Conversation)=>void;changed:()=>void;clearError:(id:string)=>void;send:(id:string,text:string,model:string,context:ReadingContext|null,effort?:string)=>Promise<boolean>;stop:(id:string)=>Promise<void>;refreshAuth:()=>Promise<AiStatus>};
const Context=createContext<Controller|null>(null);
export function AiProvider({children}:{children:ReactNode}){
  const [state,setState]=useState<State>({conversations:{},busy:new Set(),errors:{},version:0,auth:null});
  const jobs=useRef(new Map<string,AbortController>());
  const [preferences,setPreferences]=useState(readAiPreferences);
  const setPreference=useCallback((model:string,effort?:string)=>setPreferences(previous=>({...previous,model,efforts:effort===undefined?previous.efforts:{...previous.efforts,[model]:effort}})),[]);
  useEffect(()=>writeAiPreferences(preferences),[preferences]);
  const put=useCallback((value:Conversation)=>setState(previous=>({...previous,conversations:{...previous.conversations,[value.id]:value}})),[]);
  const changed=useCallback(()=>setState(previous=>({...previous,version:previous.version+1})),[]);
  const clearError=useCallback((id:string)=>setState(previous=>({...previous,errors:{...previous.errors,[id]:''}})),[]);
  const load=useCallback(async(id:string)=>{const value=await getConversation(id);if(!jobs.current.has(id))put(value);return value;},[put]);
  const refreshAuth=useCallback(async()=>{const auth=await aiStatus();setState(previous=>({...previous,auth}));return auth;},[]);
  const send=useCallback(async(id:string,text:string,model:string,context:ReadingContext|null,effort?:string)=>{
    if(jobs.current.has(id))return false;const controller=new AbortController();jobs.current.set(id,controller);
    setState(previous=>({...previous,busy:new Set([...previous.busy,id]),errors:{...previous.errors,[id]:''}}));let success=false;
    try{await streamAnswer(id,text,model,context,(event,data)=>{if(event==='conversation')put(data as Conversation);else if(event==='delta'){const delta=data as {id:string;text:string};setState(previous=>{const conversation=previous.conversations[id];return conversation?{...previous,conversations:{...previous.conversations,[id]:{...conversation,messages:conversation.messages.map(message=>message.id===delta.id?{...message,text:message.text+delta.text}:message)}}}:previous;});}},controller.signal,effort);success=true;}
    catch(error){setState(previous=>({...previous,errors:{...previous.errors,[id]:(error as Error).message}}));await getConversation(id).then(put).catch(()=>{});}
    finally{jobs.current.delete(id);setState(previous=>{const busy=new Set(previous.busy);busy.delete(id);return {...previous,busy,version:previous.version+1};});}return success;
  },[put]);
  const stop=useCallback(async(id:string)=>{await aiRequest(`/conversations/${encodeURIComponent(id)}/stop`,aiJson({}));},[]);
  useEffect(()=>{void refreshAuth().catch(()=>{});const running=jobs.current;return()=>{for(const controller of running.values())controller.abort();};},[refreshAuth]);
  return <Context.Provider value={{...state,preferences,setPreference,load,put,changed,clearError,send,stop,refreshAuth}}>{children}</Context.Provider>;
}
export function useAi(){const context=useContext(Context);if(!context)throw new Error('Missing AiProvider');return context;}
