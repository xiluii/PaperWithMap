import { useEffect,useRef,useState } from 'react';
import { assetInfo,retryPreview } from './backend';
import type { FileInfo } from './types';

export default function useAssetPreview(id:string){
  const [info,setInfo]=useState<FileInfo|null>(null),[error,setError]=useState(''),[attempt,setAttempt]=useState(0);
  const latest=useRef(info);latest.current=info;
  useEffect(()=>{let live=true;let timer:ReturnType<typeof setTimeout>;setError('');
    const check=async()=>{try{const value=await assetInfo(id);if(!live)return;setInfo(value);if(['queued','converting'].includes(value.previewStatus))timer=setTimeout(check,1200);}catch(e){if(live)setError((e as Error).message);}};
    void check();return()=>{live=false;clearTimeout(timer);};
  },[id,attempt]);
  const retry=async(force=false)=>{setError('');try{if(force||latest.current?.previewStatus==='failed')setInfo(await retryPreview(id));setAttempt(v=>v+1);}catch(e){setError((e as Error).message);}};
  return {info,error,retry};
}
