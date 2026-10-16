import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { PDFDocument } from 'pdf-lib';
import { createLocalServer } from './index.mjs';
import { CodexBridge } from './codex-bridge.mjs';

const fixture = path.resolve('tests/fixtures/codex-app-server.mjs');
async function until(check) { const end = Date.now() + 5000; while (!await check()) { if (Date.now() > end) throw Error('Condition timed out'); await new Promise(resolve => setTimeout(resolve, 15)); } }
async function setup(t, authType = 'chatgpt') {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'paperly-codex-')), log = path.join(directory, 'rpc.jsonl');
  const codex = { launch: { file: process.execPath, args: [fixture] }, environment: { ...process.env, PAPERLY_TEST_LOG: log, PAPERLY_TEST_AUTH: authType } };
  const { server, store, ai } = await createLocalServer({ directory, openFile: async () => {}, aiOptions: { mode: 'codex', codex } });
  server.listen(0, '127.0.0.1'); await once(server, 'listening'); const base = `http://127.0.0.1:${server.address().port}/api/ai`;
  const request = (route, value) => fetch(base + route, value === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(value) });
  const calls = async () => { try { return (await fs.readFile(log, 'utf8')).trim().split('\n').filter(Boolean).map(JSON.parse); } catch (error) { if (error.code === 'ENOENT') return []; throw error; } };
  t.after(async () => { ai.close(); await until(() => !ai.jobs.size); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); await ai.auth.closed; const target = path.resolve(directory); assert.ok(target.startsWith(path.resolve(os.tmpdir()) + path.sep) && path.basename(target).startsWith('paperly-codex-')); await fs.rm(target, { recursive: true, force: true }); });
  const pdf = await PDFDocument.create(); pdf.addPage().drawText('Fixture paper'); await store.uploadFile('paper', Buffer.from(await pdf.save()), 'fixture.pdf', 'application/pdf');
  await store.saveWorkspace({ version: 1, activeBoardId: 'board', boards: [{ id: 'board', title: 'Fixture', nodes: [{ id: 'node', type: 'paper', position: { x: 0, y: 0 }, data: { title: 'Fixture paper', fileId: 'paper' } }], edges: [] }], handwrittenNotes: [] });
  const create = async () => (await request('/conversations', { fileId: 'paper', anchor: { boardId: 'board', nodeId: 'node' } })).json();
  const send = (id, text = '总结文献', context = null, options = {}) => request(`/conversations/${id}/messages`, { text, model: 'fixture-model', context, requestId: crypto.randomUUID(), ...options });
  return { directory, request, ai, store, create, send, calls, codex };
}

test('Codex bridge uses managed ChatGPT auth, dynamic models and real stdio without exposing credentials', async t => {
  const { request, calls } = await setup(t);
  const state = await (await request('/status')).json(); assert.equal(state.provider, 'codex'); assert.equal(state.accounts[0].connected, true); assert.ok(!JSON.stringify(state).includes('must-never'));
  const models = await (await request('/models')).json(); assert.equal(models.models[0].id, 'fixture-model');
  assert.equal(models.models[0].defaultReasoningEffort, 'medium'); assert.deepEqual(models.models[0].supportedReasoningEfforts.map(option => option.reasoningEffort), ['low', 'medium', 'high']);
  assert.deepEqual((await calls()).slice(0, 2).map(item => item.method), ['initialize', 'initialized']);
});

test('Codex conversations stream Unicode and preserve full text, images and local history across restart', async t => {
  const { request, create, send, calls, directory, codex } = await setup(t), conversation = await create();
  const context = { kind: 'document', text: '第 1 页：完整文献内容', pages: 1 };
  assert.match(await (await send(conversation.id, '总结实验', context)).text(), /论文结论/);
  const image = 'data:image/png;base64,iVBORw0KGgo=';
  await (await send(conversation.id, '解释图片', { kind: 'page', text: '图像资料', page: 1, image })).text();
  const turns = (await calls()).filter(item => item.method === 'turn/start');
  assert.match(turns[1].params.input.find(item => item.type === 'text').text, /完整文献内容/);
  assert.match(turns[1].params.input.find(item => item.type === 'text').text, /论文结论/);
  assert.ok(turns[1].params.input.some(item => item.type === 'image' && item.url === image));
  const starts = (await calls()).filter(item => item.method === 'thread/start');
  assert.equal(starts[0].params.ephemeral, true); assert.equal(starts[0].params.sandbox, 'read-only');
  const saved = await (await request(`/conversations/${conversation.id}`)).json(); assert.equal(saved.messages.length, 4); assert.equal(saved.messages[3].status, 'completed');
  const restarted = new CodexBridge(directory, codex); await restarted.init(); await restarted.refreshStatus(); assert.equal(restarted.status().provider, 'codex'); restarted.close(); await restarted.closed;
});

test('API-key-only Codex authentication cannot silently use paid API access', async t => {
  const { request, create, send, calls } = await setup(t, 'apiKey');
  const state = await (await request('/status')).json(); assert.equal(state.accounts.length, 0);
  const conversation = await create(); assert.equal((await send(conversation.id)).status, 401);
  assert.ok(!(await calls()).some(item => item.method === 'turn/start'));
});

test('stopping a Codex answer interrupts its turn and preserves only its partial local answer', async t => {
  const { ai, request, create, send, calls } = await setup(t), conversation = await create();
  const response = await send(conversation.id, '[pause]');
  await until(() => ai.jobs.get(conversation.id)?.conversation.messages.at(-1).text);
  await request(`/conversations/${conversation.id}/stop`, {}); await response.text();
  const saved = await (await request(`/conversations/${conversation.id}`)).json(); assert.equal(saved.messages.at(-1).status, 'interrupted'); assert.equal(saved.messages.at(-1).text, '论文结论：');
  assert.ok((await calls()).some(item => item.method === 'turn/interrupt'));
});

test('the HTTP client receives a Unicode delta while the Codex turn is still running', { timeout: 10_000 }, async t => {
  const { ai, request, create, send } = await setup(t), conversation = await create();
  const response = await send(conversation.id, '[pause]');
  assert.match(response.headers.get('content-type'), /text\/event-stream/); assert.equal(response.headers.get('x-accel-buffering'), 'no');
  const reader = response.body.getReader(), decoder = new TextDecoder(); let received = '';
  const deadline = setTimeout(() => void reader.cancel(), 5000); t.after(() => clearTimeout(deadline));
  while (!received.split('\n\n').slice(0, -1).some(frame => frame.startsWith('event: delta\n'))) { const chunk = await reader.read(); assert.equal(chunk.done, false, 'stream ended before its first delta'); received += decoder.decode(chunk.value, { stream: true }); }
  clearTimeout(deadline); assert.match(received, /论文结论：/); assert.ok(ai.jobs.has(conversation.id));
  const snapshots = received.split('\n\n').filter(frame => frame.startsWith('event: conversation')).map(frame => JSON.parse(frame.split('\ndata: ')[1]));
  assert.ok(snapshots.length > 0); assert.equal(snapshots.at(-1).messages.at(-1).status, 'streaming');
  await request(`/conversations/${conversation.id}/stop`, {});
  while (true) { const chunk = await reader.read(); if (chunk.done) break; received += decoder.decode(chunk.value, { stream: true }); }
  reader.releaseLock(); assert.match(received, /"status":"interrupted"/);
});

test('model defaults and selected effort reach Codex and survive local history reload', async t => {
  const { request, create, send, calls, directory } = await setup(t), conversation = await create();
  await (await send(conversation.id, '使用模型默认强度')).text();
  await (await send(conversation.id, '使用高强度', null, { effort: 'high' })).text();
  await (await send(conversation.id, '切换模型默认强度', null, { model: 'fixture-fast' })).text();
  await (await send(conversation.id, '兼容旧模型目录', null, { model: 'fixture-legacy' })).text();
  const turns = (await calls()).filter(item => item.method === 'turn/start');
  assert.deepEqual(turns.map(turn => turn.params.effort), ['medium', 'high', 'low', undefined]);
  const saved = await (await request(`/conversations/${conversation.id}`)).json();
  assert.deepEqual(saved.messages.filter(message => message.role === 'assistant').map(message => message.effort), ['medium', 'high', 'low', undefined]);
  const disk = JSON.parse(await fs.readFile(path.join(directory, 'conversations', conversation.id + '.json'), 'utf8'));
  assert.equal(disk.messages[3].effort, 'high');
});

test('unsupported and malformed reasoning efforts fail before changing history or starting a turn', async t => {
  const { request, create, send, calls } = await setup(t), conversation = await create();
  for (const options of [{ effort: 'ultra' }, { effort: '' }, { effort: 1 }, { effort: {} }, { model: 'fixture-fast', effort: 'high' }, { model: 'fixture-legacy', effort: 'low' }]) {
    const response = await send(conversation.id, '无效强度', null, options); assert.equal(response.status, 400); assert.match((await response.json()).error, /推理强度/);
  }
  assert.ok(!(await calls()).some(item => item.method === 'turn/start'));
  assert.equal((await (await request(`/conversations/${conversation.id}`)).json()).messages.length, 0);
});

test('concurrent conversations keep their stream and cancellation isolated', async t => {
  const { request, create, send } = await setup(t), first = await create(), second = await create();
  const paused = await send(first.id, '[pause]'); await (await send(second.id, '正常回答')).text();
  await request(`/conversations/${first.id}/stop`, {}); await paused.text();
  const interrupted = await (await request(`/conversations/${first.id}`)).json(), completed = await (await request(`/conversations/${second.id}`)).json();
  assert.equal(interrupted.messages.at(-1).status, 'interrupted'); assert.equal(completed.messages.at(-1).status, 'completed');
  assert.equal(interrupted.messages.at(-1).text, '论文结论：'); assert.equal(completed.messages.at(-1).text, '论文结论：请参见 [第 1 页]。');
});

test('a missing Codex executable leaves the local library usable with an actionable status', async t => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'paperly-codex-'));
  const bridge = new CodexBridge(directory, { environment: { ...process.env, PAPERLY_CODEX_PATH: path.join(directory, 'missing.exe') } });
  t.after(async () => { bridge.close(); await bridge.closed; const target = path.resolve(directory); assert.ok(target.startsWith(path.resolve(os.tmpdir()) + path.sep) && path.basename(target).startsWith('paperly-codex-')); await fs.rm(target, { recursive: true, force: true }); });
  await bridge.init(); const status = await bridge.refreshStatus(); assert.equal(status.available, false); assert.match(status.error, /安装|install/); assert.equal(status.accounts.length, 0);
});

test('failed terminal events and a crashed child never become completed answers', async t => {
  const { request, create, send } = await setup(t);
  for (const prompt of ['[quota]', '[crash]']) { const conversation = await create(); await (await send(conversation.id, prompt)).text(); const saved = await (await request(`/conversations/${conversation.id}`)).json(); assert.equal(saved.messages.at(-1).status, 'failed'); assert.match(saved.messages.at(-1).text, /论文结论/); }
});

test('unexpected tool approvals are denied and terminate the reading-only turn', async t => {
  const { request, create, send, calls } = await setup(t), conversation = await create(); await (await send(conversation.id, '[tool]')).text();
  const saved = await (await request(`/conversations/${conversation.id}`)).json(); assert.equal(saved.messages.at(-1).status, 'failed');
  assert.ok((await calls()).some(item => item.id === 'tool-approval' && item.error));
});

test('platform disconnect persists without logging the user out of shared Codex', async t => {
  const { request, calls, directory, codex } = await setup(t); await request('/status'); const disconnected = await (await request('/auth/logout', {})).json(); assert.equal(disconnected.disconnected, true); assert.equal(disconnected.revoked, undefined);
  assert.equal((await (await request('/status')).json()).accounts.length, 0); assert.ok(!(await calls()).some(item => item.method === 'account/logout'));
  const restarted = new CodexBridge(directory, codex); await restarted.init(); assert.equal((await restarted.refreshStatus()).accounts.length, 0); restarted.close(); await restarted.closed;
  await request('/auth/start', {}); assert.equal((await (await request('/status')).json()).accounts[0].connected, true);
});

test('device-code login exposes only its short-lived user ceremony and can be canceled', async t => {
  const { request, calls } = await setup(t); await request('/status'); await request('/auth/start', { method: 'device', force: true });
  const pending = await (await request('/status')).json(); assert.equal(pending.pending, true); assert.equal(pending.login.userCode, 'TEST-1234');
  await request('/auth/cancel', {}); assert.equal((await (await request('/status')).json()).pending, false);
  assert.ok((await calls()).some(item => item.method === 'account/login/cancel'));
});
