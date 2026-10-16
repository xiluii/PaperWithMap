import { afterEach, describe, expect, it, vi } from 'vitest';
import { streamAnswer } from './ai-backend';

afterEach(()=>vi.unstubAllGlobals());
describe('browser answer streaming',()=>{
  it('delivers split Unicode SSE deltas before the response closes and forwards chosen effort',async()=>{
    let source!:ReadableStreamDefaultController<Uint8Array>;
    const response=new Response(new ReadableStream<Uint8Array>({start(controller){source=controller;}}));
    const fetcher=vi.fn().mockResolvedValue(response);vi.stubGlobal('fetch',fetcher);
    const events:{event:string;value:unknown}[]=[];
    let firstDelta!:()=>void;const received=new Promise<void>(resolve=>{firstDelta=resolve;});
    let finished=false;
    const running=streamAnswer('chat','解释公式','fixture',null,(event,value)=>{events.push({event,value});if(event==='delta')firstDelta();},new AbortController().signal,'high').then(()=>{finished=true;});
    const encoder=new TextEncoder(),bytes=encoder.encode('event: conversation\ndata: {"messages":[{"status":"streaming"}]}\n\nevent: delta\ndata: {"id":"answer","text":"推导：α"}\n\n');
    const split=bytes.findIndex(byte=>byte>127)+1;
    source.enqueue(bytes.slice(0,split));source.enqueue(bytes.slice(split,bytes.length-1));source.enqueue(bytes.slice(-1));
    await received;expect(finished).toBe(false);expect(events.at(-1)?.value).toEqual({id:'answer',text:'推导：α'});
    expect(JSON.parse(fetcher.mock.calls[0][1].body).effort).toBe('high');
    source.enqueue(encoder.encode('event: conversation\ndata: {"messages":[{"status":"completed","text":"推导：α"}]}\n\n'));source.close();
    await running;expect(finished).toBe(true);expect(events.map(item=>item.event)).toEqual(['conversation','delta','conversation']);
  });
  it('reports an interrupted transport instead of treating a partial answer as complete',async()=>{
    vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response('event: delta\ndata: {"id":"answer","text":"部分回答"}\n\n')));
    await expect(streamAnswer('chat','问题','fixture',null,()=>{},new AbortController().signal)).rejects.toThrow('连接已中断');
  });
});
