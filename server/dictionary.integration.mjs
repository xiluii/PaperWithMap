import { test } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { once } from 'node:events';
import { DictionaryService } from './dictionary-service.mjs';
import { createLocalServer } from './index.mjs';

const english = query => ({ input: query, ec: { word: [{ 'return-phrase': { l: { i: 'research' } }, ukphone: 'rɪˈsɜːtʃ', usphone: 'ˈriːsɜːrtʃ', trs: [{ tr: [{ l: { i: ['n. 研究；调查'] } }] }, { tr: [{ l: { i: ['v. 研究，探索'] } }] }] }] } });
const response = value => new Response(JSON.stringify(value), { headers: { 'Content-Type': 'application/json' } });

test('dictionary uses the fixed public dictionary endpoint, returns full definitions and caches only in memory', async () => {
  const calls = [], service = new DictionaryService({ fetch: async (input, init) => {
    const url = new URL(input); calls.push(url);
    assert.equal(url.origin, 'https://dict.youdao.com'); assert.equal(url.pathname, '/jsonapi');
    assert.deepEqual([...url.searchParams.keys()].sort(), ['dicts', 'q']);
    assert.deepEqual(JSON.parse(url.searchParams.get('dicts')).dicts, [['ec', 'ce', 'simple']]);
    assert.equal(init.redirect, 'error'); assert.equal(init.headers.Authorization, undefined);
    return response(english(url.searchParams.get('q')));
  } });
  const value = await service.lookup(' “re-\nsearch,” ');
  assert.equal(value.query, 'research'); assert.equal(value.found, true);
  assert.deepEqual(value.definitions, ['n. 研究；调查', 'v. 研究，探索']);
  assert.equal(value.pronunciations.uk, 'rɪˈsɜːtʃ');
  assert.equal(new URL(value.url).origin, 'https://dict.youdao.com');
  assert.equal((await service.lookup('RESEARCH')).query, 'RESEARCH'); assert.equal(calls.length, 1);
});

test('Chinese entries become plain text; missing entries stay missing instead of suggesting an unrelated word', async () => {
  const service = new DictionaryService({ fetch: async input => {
    const query = new URL(input).searchParams.get('q');
    return response(query === '研究' ? { input: query, ce: { word: [{ phone: 'yán jiū', trs: [{ tr: [{ l: { pos: 'n.', i: ['', { '#text': 'research', '@href': 'javascript:bad()' }] } }] }] }] } } : { input: query, meta: { isHasSimpleDict: '0' } });
  } });
  assert.deepEqual((await service.lookup('研究')).definitions, ['n. research']);
  const missing = await service.lookup('researchxyz'); assert.equal(missing.found, false); assert.deepEqual(missing.definitions, []);
});

test('invalid selections and paragraphs never reach the external dictionary', async () => {
  let calls = 0; const service = new DictionaryService({ fetch: async () => { calls++; return response({}); } });
  for (const input of [null, {}, '', '  ', '123 + 456', 'x'.repeat(121), 'word '.repeat(21)]) {
    await assert.rejects(service.lookup(input), error => error.status === 400);
  }
  assert.equal(calls, 0);
});

test('network failures, invalid upstream data and timeout produce a retryable error without AI fallback', async () => {
  for (const fetch of [async () => new Response('', { status: 429 }), async () => new Response('invalid'), async () => response({ input: 'different' }), async () => { throw new Error('secret remote diagnostics'); }]) {
    const service = new DictionaryService({ fetch });
    await assert.rejects(service.lookup('research'), error => error.status === 502 && !error.message.includes('secret'));
  }
  const service = new DictionaryService({ timeout: 5, fetch: async (_, { signal }) => {
    await new Promise(resolve => signal.addEventListener('abort', resolve, { once: true })); throw signal.reason;
  } });
  // Keep the event loop alive while exercising AbortSignal.timeout's unref'ed timer.
  const keepAlive = setTimeout(() => {}, 1000);
  try { await assert.rejects(service.lookup('research'), error => error.status === 502); } finally { clearTimeout(keepAlive); }
});

async function setup(t, fetch) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'paperly-dictionary-'));
  const { server } = await createLocalServer({ directory, dictionaryOptions: { fetch } });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(async () => {
    server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
    const target = path.resolve(directory);
    assert.ok(target.startsWith(path.resolve(os.tmpdir()) + path.sep) && path.basename(target).startsWith('paperly-dictionary-'));
    await fs.rm(target, { recursive: true, force: true });
  });
  return { url: `http://127.0.0.1:${server.address().port}/api/dictionary/lookup`, directory };
}

test('local HTTP lookup works without login, protects the endpoint and does not persist selected text or conversations', async t => {
  let calls = 0;
  const { url, directory } = await setup(t, async input => { calls++; return response(english(new URL(input).searchParams.get('q'))); });
  const before = await fs.readdir(directory, { recursive: true });
  const request = (value, headers = {}) => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(value) });
  assert.equal((await request({ text: 'research' }, { Origin: 'https://outside.invalid' })).status, 403);
  assert.equal((await request({ text: 'research' }, { 'Content-Type': 'text/plain' })).status, 415);
  assert.equal((await request({ text: 'x'.repeat(3000) })).status, 413);
  assert.equal((await request({ text: 'x'.repeat(121) })).status, 400);
  assert.equal(calls, 0);
  const result = await request({ text: 'research', fileId: 'never-sent', apiKey: 'never-sent' });
  assert.equal(result.status, 200); assert.equal((await result.json()).provider, 'youdao'); assert.equal(calls, 1);
  assert.deepEqual(await fs.readdir(directory, { recursive: true }), before);
});

test('aborting the reader request cancels an in-flight dictionary request', async t => {
  let started, cancelled;
  const began = new Promise(resolve => { started = resolve; }), ended = new Promise(resolve => { cancelled = resolve; });
  const { url } = await setup(t, async (_, { signal }) => {
    started(); await new Promise(resolve => signal.addEventListener('abort', resolve, { once: true }));
    cancelled(); throw signal.reason;
  });
  const controller = new AbortController();
  const pending = fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: 'research' }), signal: controller.signal });
  await began; controller.abort();
  await assert.rejects(pending, error => error.name === 'AbortError'); await ended;
});
