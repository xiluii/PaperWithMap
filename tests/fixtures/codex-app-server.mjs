// A real stdio child process implementing the protocol boundary for integration tests.
import readline from 'node:readline';
import { appendFileSync } from 'node:fs';
let thread = 0, turn = 0;
const active = new Map();
const send = value => {
  const bytes = Buffer.from(JSON.stringify(value) + '\n');
  // Split UTF-8 bytes across writes, as a real process pipe is allowed to do.
  const midpoint = bytes.findIndex(byte => byte > 127) + 1;
  if (midpoint > 0) { process.stdout.write(bytes.subarray(0, midpoint)); process.stdout.write(bytes.subarray(midpoint)); }
  else process.stdout.write(bytes);
};
const notify = (method, params) => send({ method, params });
for await (const line of readline.createInterface({ input: process.stdin })) {
  const message = JSON.parse(line), p = message.params || {};
  if (process.env.PAPERLY_TEST_LOG) appendFileSync(process.env.PAPERLY_TEST_LOG, line + '\n');
  if (!message.method) continue;
  const reply = result => send({ id: message.id, result });
  if (message.method === 'initialize') reply({ userAgent: 'codex-fixture/1' });
  else if (message.method === 'account/read') reply({ account: { type: process.env.PAPERLY_TEST_AUTH || 'chatgpt', email: 'fixture@paperly.invalid', planType: 'fixture-plan', accessToken: 'must-never-reach-browser' }, requiresOpenaiAuth: true });
  else if (message.method === 'model/list') reply({ data: [
    { id: 'fixture-model', model: 'fixture-model', displayName: '本地协议验收模型', isDefault: true, inputModalities: ['text', 'image'], defaultReasoningEffort: 'medium', supportedReasoningEfforts: [{ reasoningEffort: 'low', description: 'Faster' }, { reasoningEffort: 'medium', description: 'Balanced' }, { reasoningEffort: 'high', description: 'Deeper' }] },
    { id: 'fixture-fast', model: 'fixture-fast', displayName: '基础模型', defaultReasoningEffort: 'low', supportedReasoningEfforts: [{ reasoningEffort: 'low', description: 'Faster' }] },
    { id: 'fixture-legacy', model: 'fixture-legacy', displayName: '无推理选项的旧目录模型' },
  ], nextCursor: null });
  else if (message.method === 'account/login/start') {
    reply(p.type === 'chatgptDeviceCode' ? { type: p.type, loginId: 'login-fixture', verificationUrl: 'https://auth.openai.com/codex/device', userCode: 'TEST-1234' } : { type: 'chatgpt', loginId: 'login-fixture', authUrl: 'https://auth.openai.com/authorize?state=fixture' });
  } else if (message.method === 'account/login/cancel') reply({ status: 'canceled' });
  else if (message.method === 'thread/start') reply({ thread: { id: 'thread-' + ++thread }, modelProvider: 'openai' });
  else if (message.method === 'thread/unsubscribe') reply({ status: 'unsubscribed' });
  else if (message.method === 'turn/interrupt') {
    reply({}); const id = active.get(p.threadId);
    if (id) { notify('turn/completed', { threadId: p.threadId, turn: { id, status: 'interrupted' } }); active.delete(p.threadId); }
  } else if (message.method === 'turn/start') {
    const id = 'turn-' + ++turn; active.set(p.threadId, id); reply({ turn: { id, status: 'inProgress' } });
    const text = p.input.find(item => item.type === 'text')?.text || '';
    notify('item/agentMessage/delta', { threadId: p.threadId, turnId: id, itemId: id + '-answer', delta: '论文结论：' });
    if (text.includes('[pause]')) continue;
    if (text.includes('[crash]')) process.exit(2);
    if (text.includes('[tool]')) { send({ id: 'tool-approval', method: 'item/commandExecution/requestApproval', params: { threadId: p.threadId, turnId: id } }); continue; }
    setTimeout(() => {
      if (!active.has(p.threadId)) return;
      notify('item/agentMessage/delta', { threadId: p.threadId, turnId: id, itemId: id + '-answer', delta: '请参见 [第 1 页]。' });
      notify('turn/completed', { threadId: p.threadId, turn: { id, status: text.includes('[quota]') ? 'failed' : 'completed', error: text.includes('[quota]') ? { message: 'usage limit reached' } : null } }); active.delete(p.threadId);
    }, 15);
  }
}
