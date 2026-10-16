import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { generateKeyPair, SignJWT, exportJWK, createLocalJWKSet } from 'jose';
import { PDFDocument } from 'pdf-lib';
import { createLocalServer } from './index.mjs';
import { verifyIdentity } from './ai-auth.mjs';
import { ConversationStore } from './ai-conversations.mjs';
import { parseSSE } from './ai-provider.mjs';

const keys = await generateKeyPair('RS256'), jwk = await exportJWK(keys.publicKey); jwk.kid = 'paperly-test';
const keySet = createLocalJWKSet({ keys: [jwk] });
const scopes = 'openid profile email offline_access resource.invoke chatgpt.tokens.use.direct';
const sign = (claims = {}) => new SignJWT({ nonce: 'nonce', email: 'reader@example.test', ...claims }).setProtectedHeader({ alg: 'RS256', kid: 'paperly-test' }).setIssuer('https://auth.openai.com').setAudience('oaiapp_test').setSubject('reader').setIssuedAt().setExpirationTime('1h').sign(keys.privateKey);
const fixture = { version: 1, activeBoardId: 'board', boards: [{ id: 'board', title: 'Reading', nodes: [{ id: 'paper', type: 'paper', position: { x: 0, y: 0 }, data: { title: 'Research fixture', fileId: 'file' } }], edges: [] }], handwrittenNotes: [] };
const event = value => `data: ${JSON.stringify(value)}\r\n\r\n`;
async function until(predicate) { const end = Date.now() + 5000; while (!predicate()) { if (Date.now() > end) throw new Error('Condition did not complete'); await new Promise(resolve => setTimeout(resolve, 10)); } }
async function setup(t) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'paperly-ai-')), opened = [], calls = []; let authorization, behavior = 'completed', refreshes = 0, tokenGate;
  const fetcher = async (url, init = {}) => {
    calls.push({ url, init });
    if (url.endsWith('/oauth/token')) {
      const form = new URLSearchParams(init.body);
      if (form.get('grant_type') === 'refresh_token') { refreshes++; return Response.json({ access_token: 'rotated-access', refresh_token: 'rotated-refresh', token_type: 'Bearer', expires_in: 3600 }); }
      assert.equal(form.get('client_id'), 'oaiapp_test'); assert.equal(form.get('redirect_uri'), authorization.searchParams.get('redirect_uri'));
      assert.equal(crypto.createHash('sha256').update(form.get('code_verifier')).digest('base64url'), authorization.searchParams.get('code_challenge'));
      if(tokenGate)await tokenGate;
      return Response.json({ access_token: 'test-access-secret', refresh_token: 'test-refresh-secret', token_type: 'Bearer', expires_in: 3600, scope: scopes, id_token: await sign({ nonce: authorization.searchParams.get('nonce') }) });
    }
    if (url.endsWith('/models')) return Response.json({ models: [{ slug: 'fixture-model', display_name: 'Fixture model', visibility: 'list' }, { slug: 'hidden-model', display_name: 'Hidden', visibility: 'hide' }] });
    if (url.endsWith('/.well-known/openid-configuration')) return Response.json({ revocation_endpoint: 'https://auth.openai.com/oauth/revoke' });
    if (url.endsWith('/oauth/revoke')) return new Response(null, { status: 200 });
    if (url.endsWith('/responses')) {
      const request = JSON.parse(init.body); assert.equal(request.store, false); assert.equal(request.stream, true); assert.equal(request.model, 'fixture-model'); assert.ok(Array.isArray(request.input)); assert.ok(!('previous_response_id' in request)); assert.ok(!('max_output_tokens' in request));
      const encoder = new TextEncoder();
      return new Response(new ReadableStream({ start(controller) {
        const bytes = encoder.encode(event({ type: 'response.output_text.delta', delta: '论文结论：' }) + event({ type: 'response.output_text.delta', delta: '请参见 [第 1 页]。' }));
        // Deliberately split UTF-8 sequences and CRLF delimiters across network chunks.
        for (let index = 0; index < bytes.length; index += 7) controller.enqueue(bytes.slice(index, index + 7));
        if (behavior === 'pause') { init.signal.addEventListener('abort', () => controller.error(new DOMException('Aborted', 'AbortError')), { once: true }); return; }
        if (behavior === 'quota') controller.enqueue(encoder.encode(event({ type: 'response.failed', response: { error: { code: 'subscription_sharing_usage_limit_exceeded' } } })));
        else if (behavior !== 'truncated') controller.enqueue(encoder.encode(event({ type: 'response.completed' })));
        controller.close();
      } }), { headers: { 'Content-Type': 'text/event-stream' } });
    }
    throw new Error('Unexpected upstream request');
  };
  const { server, store, ai } = await createLocalServer({ directory, openFile: async url => { opened.push(url); authorization = new URL(url); }, aiOptions: { mode: 'siwc', fetcher, verify: (token, client, nonce) => verifyIdentity(token, client, nonce, keySet) } });
  server.listen(0, '127.0.0.1'); await once(server, 'listening'); const base = `http://127.0.0.1:${server.address().port}`;
  t.after(async () => { ai.close(); await until(() => !ai.jobs.size); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); const target = path.resolve(directory); assert.ok(target.startsWith(path.resolve(os.tmpdir()) + path.sep) && path.basename(target).startsWith('paperly-ai-')); await fs.rm(target, { recursive: true, force: true }); });
  const request = (p, method = 'GET', value) => fetch(base + '/api/ai' + p, { method, headers: value === undefined ? {} : { 'Content-Type': 'application/json' }, body: value === undefined ? undefined : JSON.stringify(value) });
  const login = async () => {
    assert.equal((await request('/auth/start', 'POST', {})).status, 200);
    assert.equal(authorization.searchParams.get('client_id'), 'dynamic_agent_client');
    const callback = new URL(authorization.searchParams.get('redirect_uri')); callback.search = new URLSearchParams({ code: 'test-code', state: authorization.searchParams.get('state'), client_id: 'oaiapp_test' });
    assert.equal((await fetch(callback)).status, 200); assert.equal(ai.auth.status().accounts[0].connected, true);
  };
  const doc = await PDFDocument.create(); doc.addPage().drawText('Research fixture'); await store.uploadFile('file', Buffer.from(await doc.save()), 'research.pdf', 'application/pdf'); await store.saveWorkspace(fixture);
  const create = async () => { const response = await request('/conversations', 'POST', { fileId: 'file', anchor: { boardId: 'board', nodeId: 'paper' } }); assert.equal(response.status, 201); return response.json(); };
  const send = (id, context = null) => request(`/conversations/${id}/messages`, 'POST', { text: '总结实验结果', model: 'fixture-model', context, requestId: crypto.randomUUID() });
  return { directory, ai, store, base, request, login, create, send, calls, opened, setBehavior: value => { behavior = value; }, holdTokenExchange:()=>{let release;tokenGate=new Promise(resolve=>{release=resolve;});return release;}, refreshes: () => refreshes, authorization: () => authorization };
}

test('SIWC validates PKCE, callback state and signed identity, rotates credentials once, and never exposes tokens to the browser', async t => {
  const { ai, request, login, directory, calls, refreshes } = await setup(t); await login();
  const status = await (await request('/status')).json(); assert.equal(status.accounts[0].email, 'reader@example.test'); assert.ok(!JSON.stringify(status).includes('secret')); assert.ok(!JSON.stringify(status).includes('id_token'));
  const host = ai.auth.state.hostId; assert.match(host, /^urn:uuid:/); ai.auth.active().expiresAt = 0;
  assert.deepEqual(await Promise.all([ai.auth.accessToken(), ai.auth.accessToken()]), ['rotated-access', 'rotated-access']); assert.equal(refreshes(), 1);
  const persisted = JSON.parse(await fs.readFile(path.join(directory, 'ai-auth/accounts.json'), 'utf8')); assert.equal(persisted.accounts[0].refresh_token, 'rotated-refresh'); assert.equal(persisted.hostId, host);
  assert.equal((await request('/auth/logout', 'POST', {})).status, 200); const signedOut = ai.auth.status(); assert.equal(signedOut.activeId, null); assert.equal(signedOut.accounts[0].connected, false); assert.ok(calls.some(call => call.url.endsWith('/oauth/revoke'))); assert.equal(ai.auth.state.hostId, host);
});
test('OIDC rejects wrong audience, nonce, expired tokens and invalid signatures', async () => {
  const token = await sign(); await verifyIdentity(token, 'oaiapp_test', 'nonce', keySet);
  await assert.rejects(verifyIdentity(token, 'other-client', 'nonce', keySet)); await assert.rejects(verifyIdentity(token, 'oaiapp_test', 'other-nonce', keySet));
  const expired = await new SignJWT({ nonce: 'nonce' }).setProtectedHeader({ alg: 'RS256', kid: 'paperly-test' }).setIssuer('https://auth.openai.com').setAudience('oaiapp_test').setSubject('reader').setIssuedAt().setExpirationTime(Math.floor(Date.now()/1000)-60).sign(keys.privateKey);
  await assert.rejects(verifyIdentity(expired, 'oaiapp_test', 'nonce', keySet));
  const other = await generateKeyPair('RS256'); const invalid = await new SignJWT({ nonce: 'nonce' }).setProtectedHeader({ alg: 'RS256', kid: 'paperly-test' }).setIssuer('https://auth.openai.com').setAudience('oaiapp_test').setSubject('reader').setIssuedAt().setExpirationTime('1h').sign(other.privateKey);
  await assert.rejects(verifyIdentity(invalid, 'oaiapp_test', 'nonce', keySet));
});
test('returning sign-in reuses its issued client registration and stable host, with new PKCE and nonce', async t => {
  const { login, ai, request, authorization } = await setup(t); await login();
  const account = ai.auth.status().accounts[0], before = authorization(), host = ai.auth.state.hostId;
  await request('/auth/start', 'POST', { accountId: account.id }); const next = authorization();
  assert.equal(next.searchParams.get('client_id'), 'oaiapp_test'); assert.equal(next.searchParams.get('agent_name_hint'), null); assert.equal(next.searchParams.get('ext_agent_host_id'), host); assert.notEqual(next.searchParams.get('nonce'), before.searchParams.get('nonce')); assert.notEqual(next.searchParams.get('code_challenge'), before.searchParams.get('code_challenge'));
  const callback = new URL(next.searchParams.get('redirect_uri')); callback.search = new URLSearchParams({ code: 'return-code', state: next.searchParams.get('state') }); assert.equal((await fetch(callback)).status, 200); assert.equal(ai.auth.status().accounts.length, 1); assert.equal(ai.auth.status().activeId, account.id);
});
test('mismatched OAuth state cannot activate an account and foreign pages cannot start authorization', async t => {
  const { ai, request, authorization, base, opened } = await setup(t); await request('/auth/start', 'POST', {});
  const callback = new URL(authorization().searchParams.get('redirect_uri')); callback.search = new URLSearchParams({ code: 'code', state: 'forged', client_id: 'oaiapp_test' }); assert.equal((await fetch(callback)).status, 400); assert.equal(ai.auth.status().accounts.length, 0);
  const bad = await fetch(base + '/api/ai/auth/start', { method: 'POST', headers: { Origin: 'https://untrusted.test', 'Content-Type': 'application/json' }, body: '{}' }); assert.equal(bad.status, 403); assert.equal(opened.length, 1); await request('/auth/cancel', 'POST', {});
});
test('pending stays true during a slow token exchange so the browser keeps polling for completion',async t=>{
  const {ai,request,authorization,calls,holdTokenExchange}=await setup(t),release=holdTokenExchange();
  await request('/auth/start','POST',{});const url=authorization(),callback=new URL(url.searchParams.get('redirect_uri'));callback.search=new URLSearchParams({code:'slow-code',state:url.searchParams.get('state'),client_id:'oaiapp_test'});
  const completing=fetch(callback);await until(()=>calls.some(call=>call.url.endsWith('/oauth/token')));
  try{const status=await (await request('/status')).json();assert.equal(status.pending,true);assert.equal(status.connected,undefined);assert.equal(status.accounts.length,0);}
  finally{release();await completing;}
  assert.equal(ai.auth.status().pending,false);assert.equal(ai.auth.status().accounts[0].connected,true);
});
test('canceling an in-flight callback cannot activate the canceled ChatGPT connection',async t=>{
  const {ai,request,authorization,calls,holdTokenExchange}=await setup(t),release=holdTokenExchange();
  await request('/auth/start','POST',{});const url=authorization(),callback=new URL(url.searchParams.get('redirect_uri'));callback.search=new URLSearchParams({code:'cancel-code',state:url.searchParams.get('state'),client_id:'oaiapp_test'});
  const completing=fetch(callback);await until(()=>calls.some(call=>call.url.endsWith('/oauth/token')));await request('/auth/cancel','POST',{});release();
  assert.equal((await completing).status,400);assert.equal(ai.auth.status().accounts.length,0);
});
test('real local HTTP streams preserve Unicode and full document context, persist history, search answers and resume after restart', async t => {
  const { request, login, create, send, ai, directory, calls } = await setup(t); await login(); const conversation = await create();
  assert.equal((await request('/models')).status, 200); const response = await send(conversation.id, { kind: 'document', text: '[第 1 页]\nResearch fixture', pages: 1 }); assert.equal(response.status, 200); assert.match(response.headers.get('content-type'), /text\/event-stream/); const streamed = await response.text(); assert.match(streamed, /论文结论/);
  const saved = await ai.conversations.get(conversation.id); assert.equal(saved.messages.at(-1).status, 'completed'); assert.equal(saved.messages.at(-1).text, '论文结论：请参见 [第 1 页]。');
  const restart = new ConversationStore(directory); await restart.init(); assert.deepEqual(await restart.get(saved.id), saved);
  const detail = await (await request('/conversations/' + saved.id)).json(); assert.equal(detail.documentContext, undefined); assert.equal(detail.hasDocumentContext, true);
  const list = await (await request('/conversations?q=' + encodeURIComponent('论文结论'))).json(); assert.equal(list.total, 1); assert.equal(list.items[0].id, saved.id);
  const continued = await send(saved.id); await continued.text(); const body = JSON.parse(calls.filter(call => call.url.endsWith('/responses')).at(-1).init.body); assert.ok(body.input.some(item => item.role === 'assistant' && item.content.includes('第 1 页'))); assert.ok(body.input[0].content[0].text.includes('Research fixture'));
  const renamed = await request('/conversations/' + saved.id, 'PUT', { title: '实验讨论' }); assert.equal(renamed.status, 200); assert.equal((await renamed.json()).title, '实验讨论');
});
test('history paginates all records, filters by file, and deletes only the selected conversation', async t => {
  const { create, request } = await setup(t); const ids=[]; for(let index=0;index<23;index++) ids.push((await create()).id);
  let list = await (await request('/conversations?page=2')).json(); assert.equal(list.total, 23); assert.equal(list.items.length, 3); assert.equal(list.pageSize, 20);
  list = await (await request('/conversations?fileId=missing')).json(); assert.equal(list.total, 0);
  assert.equal((await request('/conversations/' + ids[0], 'DELETE')).status, 200); assert.equal((await request('/conversations/' + ids[0])).status, 404); assert.equal((await (await request('/conversations')).json()).total, 22);
});
test('stop interrupts the upstream stream, saves partial output and allows a follow-up', async t => {
  const { login, create, send, ai, request, setBehavior } = await setup(t); await login(); setBehavior('pause'); const conversation = await create();
  const response = await send(conversation.id); const reading = response.text(); await until(() => ai.jobs.get(conversation.id)?.conversation.messages.at(-1)?.text.length > 0);
  assert.equal((await request('/conversations/' + conversation.id, 'DELETE')).status, 409); await request('/conversations/' + conversation.id + '/stop', 'POST', {}); await reading;
  assert.equal((await ai.conversations.get(conversation.id)).messages.at(-1).status, 'interrupted'); setBehavior('completed'); await (await send(conversation.id)).text(); assert.equal((await ai.conversations.get(conversation.id)).messages.at(-1).status, 'completed');
});
test('quota and missing-terminal errors preserve partial answers without declaring success', async t => {
  const { login, create, send, ai, setBehavior } = await setup(t); await login();
  for (const behavior of ['quota', 'truncated']) { setBehavior(behavior); const conversation = await create(); await (await send(conversation.id)).text(); const saved = await ai.conversations.get(conversation.id), answer = saved.messages.at(-1); assert.equal(answer.status, 'failed'); assert.ok(answer.text.includes('论文结论')); assert.match(answer.error, behavior === 'quota' ? /额度/ : /中断/); }
});
test('restart marks unfinished messages interrupted; context validation and unknown models prevent upstream calls', async t => {
  const { login, create, ai, request, directory, calls } = await setup(t); await login(); const conversation = await create();
  const value = await ai.conversations.get(conversation.id); value.messages.push({ id: 'unfinished', role: 'assistant', text: 'partial', status: 'streaming' }); await ai.conversations.save(value); const restart = new ConversationStore(directory); await restart.init(); assert.equal((await restart.get(conversation.id)).messages[0].status, 'interrupted');
  const requestBody = { text: 'question', model: 'fixture-model', requestId: 'request', context: { kind: 'page', text: 'context', image: 'https://untrusted.test/image' } };
  assert.equal((await request('/conversations/' + conversation.id + '/messages', 'POST', requestBody)).status, 400);
  assert.equal((await request('/conversations/' + conversation.id + '/messages', 'POST', { ...requestBody, model: 'hidden-model', context: null })).status, 400); assert.equal(calls.filter(call => call.url.endsWith('/responses')).length, 0);
});
test('saved answer links require a persisted matching text card and stay intact when a conversation is deleted', async t => {
  const { login, create, send, request, ai, store } = await setup(t); await login(); const conversation = await create(); await (await send(conversation.id)).text();
  const answer = (await ai.conversations.get(conversation.id)).messages.at(-1), anchor = { boardId: 'board', nodeId: 'ai-note' };
  assert.equal((await request('/conversations/'+conversation.id+'/note','POST',{messageId:answer.id,anchor})).status,400);
  const workspace = await store.workspace(); workspace.boards[0].nodes.push({id:'ai-note',type:'text',position:{x:400,y:0},data:{title:'AI reading note',html:'<p>Answer</p>',color:'white',createdAt:new Date().toISOString(),sourceFileId:'file',aiSource:{conversationId:conversation.id,messageId:answer.id}}}); await store.saveWorkspace(workspace);
  const response = await request('/conversations/'+conversation.id+'/note','POST',{messageId:answer.id,anchor}); assert.equal(response.status,200); assert.deepEqual((await response.json()).messages.at(-1).noteAnchor,anchor);
  await request('/conversations/'+conversation.id,'DELETE'); assert.ok((await store.workspace()).boards[0].nodes.some(node=>node.id==='ai-note'));
});
test('SSE parser accepts delimiter and Unicode boundaries at every byte', async () => {
  const bytes = new TextEncoder().encode(event({ type: 'response.output_text.delta', delta: '学术研究' }) + event({ type: 'response.completed' }));
  const stream = new ReadableStream({ start(controller) { for (const byte of bytes) controller.enqueue(new Uint8Array([byte])); controller.close(); } });
  const events = []; for await (const value of parseSSE(stream)) events.push(value); assert.equal(events[0].delta, '学术研究'); assert.equal(events.at(-1).type, 'response.completed');
});
