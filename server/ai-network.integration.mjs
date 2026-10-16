import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { once } from 'node:events';
import { createOpenAIFetch } from './ai-network.mjs';

test('OpenAI transport honors the configured proxy without sending localhost traffic to it', async t => {
  const targets=[];
  const proxy=http.createServer();
  proxy.on('connect',(req,socket,head)=>{
    targets.push(req.url);socket.on('error',()=>{});socket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
    const respond=()=>{const body=JSON.stringify({throughProxy:true});socket.end(`HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: ${Buffer.byteLength(body)}\r\nConnection: close\r\n\r\n${body}`);};
    if(head.length)respond();else socket.once('data',respond);
  });
  proxy.listen(0,'127.0.0.1');await once(proxy,'listening');
  const local=http.createServer((req,res)=>{res.setHeader('Content-Type','application/json');res.end('{"local":true}');});local.listen(0,'127.0.0.1');await once(local,'listening');
  const request=createOpenAIFetch({HTTP_PROXY:`http://127.0.0.1:${proxy.address().port}`,NO_PROXY:''});
  t.after(async()=>{await request.close();proxy.closeAllConnections();local.closeAllConnections();await Promise.all([new Promise(resolve=>proxy.close(resolve)),new Promise(resolve=>local.close(resolve))]);});
  const remote=await request('http://paperly-transport.invalid/oidc',{signal:AbortSignal.timeout(3000)});assert.deepEqual(await remote.json(),{throughProxy:true});assert.deepEqual(targets,['paperly-transport.invalid:80']);
  const nearby=await request(`http://127.0.0.1:${local.address().port}/health`,{signal:AbortSignal.timeout(3000)});assert.deepEqual(await nearby.json(),{local:true});assert.equal(targets.length,1);
});
