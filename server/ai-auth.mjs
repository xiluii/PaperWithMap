import http from 'node:http';
import crypto from 'node:crypto';
import path from 'node:path';
import os from 'node:os';
import { promises as fs } from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createRemoteJWKSet, jwtVerify, customFetch } from 'jose';
import { ApiError } from './storage.mjs';
import { openaiFetch } from './ai-network.mjs';

const issuer = 'https://auth.openai.com';
const resource = 'https://api.openai.com/v1';
const scope = 'openid profile email offline_access resource.invoke chatgpt.tokens.use.direct';
const random = (size = 32) => crypto.randomBytes(size).toString('base64url');
const jwks = createRemoteJWKSet(new URL(issuer + '/.well-known/jwks.json'), { [customFetch]: openaiFetch, timeoutDuration: 30_000 });
const execute = promisify(execFile);
async function read(file, fallback) { try { return JSON.parse(await fs.readFile(file, 'utf8')); } catch (error) { if (error.code === 'ENOENT') return fallback; throw error; } }
async function write(file, value) {
  const temporary = file + '.' + crypto.randomUUID() + '.tmp';
  try { await fs.writeFile(temporary, JSON.stringify(value, null, 2), { mode: 0o600 }); await fs.rename(temporary, file); }
  finally { await fs.rm(temporary, { force: true }).catch(() => {}); }
}
export async function verifyIdentity(token, clientId, nonce, keySet = jwks) {
  const { payload } = await jwtVerify(token, keySet, { issuer, audience: clientId, requiredClaims: ['sub', 'exp', 'iat'], clockTolerance: 5 });
  if (payload.nonce !== nonce || typeof payload.sub !== 'string' || !payload.sub) throw new ApiError(401, 'ChatGPT 身份验证失败，请重新连接');
  return payload;
}
export class ChatGPTAuth {
  constructor(directory, { fetcher = openaiFetch, openBrowser, verify = verifyIdentity } = {}) {
    this.directory = path.join(directory, 'ai-auth'); this.fetcher = fetcher; this.openBrowser = openBrowser; this.verify = verify;
    this.state = { version: 1, hostId: '', activeId: null, accounts: [] }; this.pending = null; this.completing = null; this.refreshing = null; this.lastError = ''; this.queue = Promise.resolve();
  }
  async init() {
    await fs.mkdir(this.directory, { recursive: true, mode: 0o700 });
    if (process.platform === 'win32') {
      const user = process.env.USERDOMAIN ? `${process.env.USERDOMAIN}\\${os.userInfo().username}` : os.userInfo().username;
      await execute('icacls.exe', [this.directory, '/inheritance:r', '/grant:r', `${user}:(OI)(CI)F`], { windowsHide: true });
    } else await fs.chmod(this.directory, 0o700);
    this.state = await read(path.join(this.directory, 'accounts.json'), this.state);
    if (!this.state.hostId) { this.state.hostId = 'urn:uuid:' + crypto.randomUUID(); await this.persist(); }
  }
  persist() {
    const snapshot = structuredClone(this.state);
    const next = this.queue.catch(() => {}).then(() => write(path.join(this.directory, 'accounts.json'), snapshot)); this.queue = next; return next;
  }
  active() { return this.state.accounts.find(account => account.id === this.state.activeId); }
  status() {
    return { activeId: this.state.activeId, accounts: this.state.accounts.map(account => ({ id: account.id, label: account.label, email: account.email, connected: !!account.access_token, planEnabled: account.scopes?.includes('chatgpt.tokens.use.direct') || false })), pending: !!(this.pending || this.completing), phase: this.completing ? 'verifying' : this.pending ? 'browser' : 'idle', error: this.lastError };
  }
  cancel() {
    const pending = this.pending; this.pending = null;
    if (pending) { clearTimeout(pending.timer); pending.server.close(); }
    this.completing?.controller.abort(); this.completing = null;
  }
  async start(accountId) {
    this.cancel(); this.lastError = '';
    const account = accountId ? this.state.accounts.find(item => item.id === accountId) : null;
    if (accountId && !account) throw new ApiError(404, '保存的 ChatGPT 账号不存在');
    const state = random(), nonce = random(), verifier = random(64);
    const server = http.createServer((req, res) => void this.callback(req, res));
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
    const redirectUri = `http://127.0.0.1:${server.address().port}/auth/callback`;
    const pending = { server, state, nonce, verifier, redirectUri, account, expires: Date.now() + 600_000 };
    pending.timer = setTimeout(() => { if (this.pending === pending) { this.lastError = '授权已超时，请重新连接 ChatGPT'; this.cancel(); } }, 600_000); pending.timer.unref(); this.pending = pending;
    const url = new URL(issuer + '/api/accounts/authorize');
    url.search = new URLSearchParams({ client_id: account?.client_id || 'dynamic_agent_client', ext_agent_host_id: this.state.hostId, response_type: 'code', redirect_uri: redirectUri, scope, resource, state, nonce, code_challenge_method: 'S256', code_challenge: crypto.createHash('sha256').update(verifier).digest('base64url') }).toString();
    if (!account) url.searchParams.set('agent_name_hint', 'Paperly');
    if (account?.id_token) url.searchParams.set('id_token_hint', account.id_token);
    if (account?.email) url.searchParams.set('login_hint', account.email);
    try { await this.openBrowser(url.toString()); } catch { this.cancel(); throw new ApiError(500, '无法打开系统浏览器，请检查默认浏览器设置'); }
    return { pending: true };
  }
  async tokenRequest(values, signal) {
    let response;
    try { response = await this.fetcher(issuer + '/api/accounts/oauth/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' }, body: new URLSearchParams(values), signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(30_000)]) : AbortSignal.timeout(30_000) }); }
    catch { throw new ApiError(502, '无法连接 OpenAI 授权服务，请检查网络后重试'); }
    if (!response.ok) throw new ApiError(401, 'ChatGPT 授权已失效或未完成，请重新连接');
    const tokens = await response.json();
    if (typeof tokens.access_token !== 'string' || !Number.isFinite(tokens.expires_in) || tokens.expires_in <= 0 || (tokens.token_type && tokens.token_type.toLowerCase() !== 'bearer')) throw new ApiError(401, '授权服务未返回有效凭证，请重新连接');
    return tokens;
  }
  async callback(req, res) {
    res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.setHeader('Cache-Control', 'no-store'); res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'; base-uri 'none'");
    const finish = (ok, message) => { res.statusCode = ok ? 200 : 400; res.end(`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>Paperly · ChatGPT</title><style>body{font:16px/1.8 system-ui;background:#f4f7f4;color:#243c31;display:grid;place-content:center;height:90vh}main{max-width:460px;padding:40px;background:white;border-radius:18px}p{color:#65776c}</style><main><h1>${ok ? 'ChatGPT 已连接' : '未能连接 ChatGPT'}</h1><p>${message}</p><p>现在可以关闭此页面，返回 Paperly。</p></main></html>`); };
    const pending = this.pending;
    let url; try { url = new URL(req.url, 'http://127.0.0.1'); } catch { return finish(false, '回调地址无效。'); }
    if (req.method !== 'GET' || url.pathname !== '/auth/callback' || req.headers.host !== new URL(pending?.redirectUri || 'http://127.0.0.1').host || !pending || pending.expires < Date.now() || url.searchParams.get('state') !== pending.state) return finish(false, '授权验证失败，请从 Paperly 重新发起连接。');
    // Consume the listener once, but keep polling active until validation finishes.
    this.pending = null; clearTimeout(pending.timer); pending.server.close();
    pending.controller = new AbortController(); this.completing = pending;
    try {
      if (url.searchParams.has('error')) throw new ApiError(401, '未获授权，请在连接时允许 Paperly 使用你的 ChatGPT 套餐');
      const clientId = url.searchParams.get('client_id') || pending.account?.client_id;
      if (!clientId || clientId === 'dynamic_agent_client' || !/^[A-Za-z0-9_-]{1,300}$/.test(clientId) || pending.account && clientId !== pending.account.client_id || !url.searchParams.get('code')) throw new ApiError(401, '客户端注册不完整，请重新连接');
      const tokens = await this.tokenRequest({ grant_type: 'authorization_code', client_id: clientId, code: url.searchParams.get('code'), code_verifier: pending.verifier, redirect_uri: pending.redirectUri, resource }, pending.controller.signal);
      const identity = await this.verify(tokens.id_token, clientId, pending.nonce);
      if (this.completing !== pending || pending.controller.signal.aborted) throw new ApiError(401, '此连接已取消，请从 Paperly 重新发起授权');
      if (pending.account && identity.sub !== pending.account.subject) throw new ApiError(401, '授权账号与所选账号不一致，请选择添加另一个账号');
      const scopes = typeof tokens.scope === 'string' ? tokens.scope.split(/\s+/).filter(Boolean) : [];
      if (!scopes.includes('chatgpt.tokens.use.direct')) throw new ApiError(403, '尚未允许使用 ChatGPT 套餐，请重新连接并勾选套餐权限');
      const existing = this.state.accounts.find(item => item.client_id === clientId && item.subject === identity.sub);
      const account = { id: existing?.id || crypto.randomUUID(), client_id: clientId, subject: identity.sub, email: typeof identity.email === 'string' ? identity.email : '', label: existing?.label || `ChatGPT ${this.state.accounts.length + 1}`, ...tokens, scopes, expiresAt: Date.now() + tokens.expires_in * 1000 };
      this.state.accounts = [...this.state.accounts.filter(item => item.id !== account.id), account]; this.state.activeId = account.id; await this.persist(); this.lastError = '';
      finish(true, '你正在使用 ChatGPT 套餐额度。可在 ChatGPT 的用量设置中管理 Paperly 的使用限额。');
    } catch (error) {
      const message = error instanceof ApiError ? error.message : 'ChatGPT 身份校验失败，请重新连接';
      if (this.completing === pending) this.lastError = message;
      finish(false, message);
    } finally { if (this.completing === pending) this.completing = null; }
  }
  async select(id) {
    const account = this.state.accounts.find(item => item.id === id);
    if (!account?.access_token) throw new ApiError(401, '请先重新授权此账号');
    this.cancel(); this.state.activeId = id; this.lastError = ''; await this.persist(); return this.status();
  }
  async accessToken() {
    const account = this.active(); if (!account?.access_token) throw new ApiError(401, '请先连接 ChatGPT 账号');
    if (!account.scopes.includes('chatgpt.tokens.use.direct')) throw new ApiError(403, '此账号尚未授权使用 ChatGPT 套餐');
    if (account.expiresAt > Date.now() + 60_000) return account.access_token;
    if (!account.refresh_token) throw new ApiError(401, '授权已过期，请重新连接 ChatGPT');
    if (this.refreshing) { await this.refreshing; return this.accessToken(); }
    this.refreshing = (async () => {
      const tokens = await this.tokenRequest({ grant_type: 'refresh_token', client_id: account.client_id, refresh_token: account.refresh_token, resource });
      const scopes = typeof tokens.scope === 'string' ? tokens.scope.split(/\s+/).filter(Boolean) : account.scopes;
      Object.assign(account, tokens, { scopes, expiresAt: Date.now() + tokens.expires_in * 1000 }); await this.persist();
    })();
    try { await this.refreshing; return account.access_token; } finally { this.refreshing = null; }
  }
  async logout() {
    this.cancel(); if (this.refreshing) await this.refreshing.catch(() => {});
    const account = this.active(); let revoked = !account?.refresh_token;
    if (account?.refresh_token) {
      try {
        const discovery = await this.fetcher(issuer + '/.well-known/openid-configuration', { signal: AbortSignal.timeout(15_000) });
        const endpoint = (await discovery.json()).revocation_endpoint;
        if (typeof endpoint !== 'string' || new URL(endpoint).origin !== issuer) throw new Error('Invalid revocation endpoint');
        for (let attempt = 0; attempt < 2 && !revoked; attempt++) {
          const response = await this.fetcher(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ token: account.refresh_token, token_type_hint: 'refresh_token', client_id: account.client_id }), signal: AbortSignal.timeout(15_000) }); revoked = response.status === 200;
          if (!revoked && response.status < 500) break;
          if (!revoked) await new Promise(resolve => setTimeout(resolve, 500));
        }
      } catch { /* Local sign-out must still finish when the network is unavailable. */ }
    }
    if (account) { for (const field of ['access_token', 'refresh_token', 'id_token']) delete account[field]; await this.persist(); }
    this.state.activeId = null; await this.persist(); return { ...this.status(), revoked };
  }
}
