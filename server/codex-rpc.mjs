import { spawn } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { ApiError } from './storage.mjs';

export async function findCodex(environment = process.env) {
  const explicit = environment.PAPERLY_CODEX_PATH;
  const directories = (environment.PATH || environment.Path || '').split(path.delimiter).filter(Boolean).map(value => value.replace(/^"|"$/g, ''));
  const candidates = explicit ? [path.resolve(explicit)] : directories.flatMap(directory => [path.join(directory, process.platform === 'win32' ? 'codex.exe' : 'codex'), path.join(directory, 'node_modules/@openai/codex/bin/codex.js')]);
  for (const candidate of candidates) {
    try {
      if (!(await fs.stat(candidate)).isFile()) continue;
      if (/\.js$/i.test(candidate)) return { file: process.execPath, args: [candidate] };
      if (process.platform !== 'win32' || /\.exe$/i.test(candidate)) return { file: candidate, args: [] };
    } catch { /* Try the next PATH entry. */ }
  }
  throw new ApiError(503, '未找到 Codex CLI。请运行 npm install -g @openai/codex，或设置 PAPERLY_CODEX_PATH 后重启。');
}

export const readingConfig = {
  'features.shell_tool': false, 'features.unified_exec': false, 'features.code_mode': false,
  'features.code_mode_host': false, 'features.apps': false, 'features.plugins': false,
  'features.hooks': false, 'features.multi_agent': false, 'features.browser_use': false,
  'features.computer_use': false, 'features.image_generation': false, 'features.view_image': false,
  'features.shell_snapshot': false, 'mcp_servers': {}, 'web_search': 'disabled',
  'project_doc_max_bytes': 0, 'developer_instructions': '', 'analytics.enabled': false,
};

export class CodexRPC extends EventEmitter {
  constructor({ launch, environment = process.env, cwd } = {}) {
    super(); this.launch = launch; this.environment = environment; this.cwd = cwd;
    this.calls = new Map(); this.sequence = 0; this.child = null; this.ready = null;
  }
  async start() {
    if (this.ready) return this.ready;
    this.ready = this.connect().catch(error => { this.ready = null; throw error; }); return this.ready;
  }
  async connect() {
    const launch = this.launch || await findCodex(this.environment);
    const args = [...(launch.args || []), 'app-server', '--listen', 'stdio://'];
    for (const [key, value] of Object.entries(readingConfig)) args.push('-c', key + '=' + (typeof value === 'object' ? '{}' : JSON.stringify(value)));
    args.push('-c', 'model_provider="openai"');
    const environment = { ...this.environment };
    for (const key of ['OPENAI_API_KEY', 'CODEX_API_KEY', 'CODEX_THREAD_ID', 'CODEX_INTERNAL_ORIGINATOR_OVERRIDE']) delete environment[key];
    if (environment.PAPERLY_CODEX_HOME) environment.CODEX_HOME = path.resolve(environment.PAPERLY_CODEX_HOME);
    const child = spawn(launch.file, args, { cwd: this.cwd, env: environment, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true }); this.child = child;
    this.closed = new Promise(resolve => child.once('close', resolve));
    child.stderr.on('data', () => {}); // Raw diagnostics may contain credential-bearing URLs.
    child.stdin.on('error', () => {});
    const lines = readline.createInterface({ input: child.stdout });
    lines.on('line', line => {
      if (this.child !== child) return;
      if (line.length > 4_000_000) { this.fail(new ApiError(502, 'Codex 返回的数据过大，连接已关闭')); child.kill(); return; }
      let message; try { message = JSON.parse(line); } catch { this.fail(new ApiError(502, 'Codex 协议数据无效，请更新 CLI 后重试')); child.kill(); return; }
      if (message.method) {
        if (message.id !== undefined) this.write({ id: message.id, error: { code: -32601, message: 'Paperly reading assistant does not permit tool execution or permission requests' } });
        this.emit('message', message); return;
      }
      const call = this.calls.get(message.id); if (!call) return;
      this.calls.delete(message.id); clearTimeout(call.timer);
      if (message.error) call.reject(new ApiError(502, 'Codex 请求失败：' + safeMessage(message.error.message)));
      else call.resolve(message.result);
    });
    child.once('error', () => this.fail(new ApiError(503, '无法启动 Codex CLI，请检查安装路径与运行权限')));
    child.once('close', () => { lines.close(); if (this.child === child) { this.child = null; this.ready = null; this.fail(new ApiError(502, '本地 Codex 进程已退出，已保留生成内容，请重新连接')); } });
    try {
      await this.request('initialize', { clientInfo: { name: 'paperly_local_reader', title: 'Paperly 文献阅读助手', version: '0.1.0' } });
      this.write({ method: 'initialized', params: {} });
    } catch (error) { await this.close(); throw error; }
  }
  write(message) {
    if (!this.child || this.child.stdin.destroyed) throw new ApiError(503, 'Codex 本地连接已断开');
    this.child.stdin.write(JSON.stringify(message) + '\n');
  }
  request(method, params = {}, timeout = 45_000) {
    return new Promise((resolve, reject) => {
      const id = ++this.sequence;
      const timer = setTimeout(() => { this.calls.delete(id); reject(new ApiError(504, 'Codex 响应超时，请检查网络后重试')); }, timeout); timer.unref();
      this.calls.set(id, { resolve, reject, timer });
      try { this.write({ id, method, params }); } catch (error) { clearTimeout(timer); this.calls.delete(id); reject(error); }
    });
  }
  fail(error) {
    for (const call of this.calls.values()) { clearTimeout(call.timer); call.reject(error); } this.calls.clear(); this.emit('failure', error);
  }
  async close() {
    const child = this.child; if (!child) return;
    child.stdin.end(); const timer = setTimeout(() => child.kill(), 1500); timer.unref();
    await this.closed; clearTimeout(timer);
  }
}

export function safeMessage(message = '') {
  return String(message).replace(/Bearer\s+\S+/gi, '[凭证已隐藏]').replace(/https?:\/\/\S+/g, '[服务地址]').replace(/(?:sk-|eyJ)[A-Za-z0-9_.-]+/g, '[凭证已隐藏]').slice(0, 500);
}
