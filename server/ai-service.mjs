import { ApiError, validId } from './storage.mjs';
import { ChatGPTAuth } from './ai-auth.mjs';
import { ConversationStore, publicConversation, validateContext } from './ai-conversations.mjs';
import { OpenAIProvider } from './ai-provider.mjs';
import { CodexBridge } from './codex-bridge.mjs';
import crypto from 'node:crypto';

export class AiService {
  constructor(store, { openBrowser, fetcher, verify, mode = process.env.PAPERLY_AI_PROVIDER || 'codex', codex } = {}) {
    if (!['codex', 'siwc'].includes(mode)) throw new ApiError(500, '无效的 AI 接入方式');
    this.store = store; this.auth = mode === 'codex' ? new CodexBridge(store.directory, { ...codex, openBrowser }) : new ChatGPTAuth(store.directory, { openBrowser, fetcher, verify });
    this.conversations = new ConversationStore(store.directory); this.provider = mode === 'codex' ? this.auth : new OpenAIProvider(this.auth, fetcher); this.jobs = new Map();
  }
  async init() { await this.auth.init(); await this.conversations.init(); }
  close() { for (const job of this.jobs.values()) job.controller.abort(); if (this.auth.close) this.auth.close(); else this.auth.cancel(); }
  async handle(req, res, url, jsonBody, json) {
    const p = url.pathname, method = req.method;
    if (!p.startsWith('/api/ai/')) return false;
    if (p === '/api/ai/status' && method === 'GET') { json(res, 200, this.auth.refreshStatus ? await this.auth.refreshStatus() : this.auth.status()); return true; }
    if (p === '/api/ai/auth/start' && method === 'POST') { const value = await jsonBody(req); if (this.jobs.size) throw new ApiError(409, '请先停止正在生成的回答，再更改连接'); json(res, 200, await this.auth.start(value.accountId, value)); return true; }
    if (p === '/api/ai/auth/cancel' && method === 'POST') { await jsonBody(req); await this.auth.cancel(); json(res, 200, this.auth.status()); return true; }
    if (p === '/api/ai/auth/refresh' && method === 'POST') { await jsonBody(req); json(res, 200, this.auth.refreshStatus ? await this.auth.refreshStatus(true) : this.auth.status()); return true; }
    if (p === '/api/ai/auth/select' && method === 'POST') { const value = await jsonBody(req); if (this.jobs.size) throw new ApiError(409, '请先停止正在生成的回答，再切换账号'); json(res, 200, await this.auth.select(value.id)); return true; }
    if (p === '/api/ai/auth/logout' && method === 'POST') { await jsonBody(req); for (const job of this.jobs.values()) job.controller.abort(); json(res, 200, await this.auth.logout()); return true; }
    if (p === '/api/ai/models' && method === 'GET') { json(res, 200, { models: await this.provider.models(true) }); return true; }
    if (p === '/api/ai/conversations') {
      if (method === 'GET') { json(res, 200, await this.conversations.list(url.searchParams)); return true; }
      if (method === 'POST') { json(res, 201, await this.conversations.create(await jsonBody(req), this.store)); return true; }
    }
    const match = /^\/api\/ai\/conversations\/([a-zA-Z0-9_-]{1,100})(?:\/(messages|stop|note))?$/.exec(p);
    if (!match) throw new ApiError(404, 'AI 接口不存在');
    const [, id, action] = match, job = this.jobs.get(id);
    if (!action && method === 'GET') { json(res, 200, publicConversation(job?.conversation || await this.conversations.get(id))); return true; }
    if (!action && method === 'PUT') { if (job) throw new ApiError(409, '请在回答完成后重命名'); json(res, 200, await this.conversations.rename(id, (await jsonBody(req)).title)); return true; }
    if (!action && method === 'DELETE') { if (job) throw new ApiError(409, '请先停止正在生成的回答，再删除对话'); await this.conversations.remove(id); json(res, 200, { ok: true }); return true; }
    if (action === 'stop' && method === 'POST') { await jsonBody(req); job?.controller.abort(); json(res, 200, { ok: true }); return true; }
    if (action === 'note' && method === 'POST') {
      if (job) throw new ApiError(409, '请在回答完成后保存关联笔记');
      const value = await jsonBody(req), workspace = await this.store.workspace();
      const node = workspace?.boards.find(board => board.id === value.anchor?.boardId)?.nodes.find(node => node.id === value.anchor?.nodeId && node.type === 'text' && node.data.aiSource?.conversationId === id && node.data.aiSource?.messageId === value.messageId);
      if (!node) throw new ApiError(400, '关联笔记尚未保存到本地白板');
      json(res, 200, await this.conversations.linkNote(id, value.messageId, value.anchor)); return true;
    }
    if (action === 'messages' && method === 'POST') { await this.send(id, await jsonBody(req), res); return true; }
    throw new ApiError(404, 'AI 接口不存在');
  }
  async send(id, value, res) {
    if (this.jobs.has(id)) throw new ApiError(409, '此对话正在生成回答');
    if (this.jobs.size >= 3) throw new ApiError(429, '已有三个回答正在生成，请稍后再试');
    if (typeof value.text !== 'string' || !value.text.trim() || value.text.length > 20_000) throw new ApiError(400, '问题需为 1–20000 个字符');
    validId(value.requestId); const context = validateContext(value.context);
    const conversation = await this.conversations.get(id);
    if (conversation.messages.some(message => message.requestId === value.requestId)) throw new ApiError(409, '此问题已提交，请查看已有回答');
    if (conversation.messages.length >= 400) throw new ApiError(413, '本次对话较长，请新建对话');
    const models = await this.provider.models();
    const model = models.find(model => model.id === value.model);
    if (!model) throw new ApiError(400, '请选择当前账号可用的模型');
    const supported = model.supportedReasoningEfforts || [];
    if (value.effort != null && (typeof value.effort !== 'string' || !supported.some(option => option.reasoningEffort === value.effort))) throw new ApiError(400, '当前模型不支持此推理强度，请刷新模型后重新选择');
    const effort = value.effort ?? model.defaultReasoningEffort;
    // Another request may have completed authorization/catalog loading concurrently.
    if (this.jobs.has(id)) throw new ApiError(409, '此对话正在生成回答');
    const createdAt = new Date().toISOString();
    if (context?.kind === 'document' || context?.kind === 'image') conversation.documentContext = context;
    const question = { id: crypto.randomUUID(), requestId: value.requestId, role: 'user', text: value.text.trim(), createdAt, status: 'completed', context: context && !['document', 'image'].includes(context.kind) ? context : undefined, contextLabel: context ? { kind: context.kind, page: context.page, pages: context.pages, characters: context.text.length } : undefined };
    const answer = { id: crypto.randomUUID(), role: 'assistant', text: '', createdAt, status: 'streaming', model: value.model, ...(effort ? { effort } : {}) };
    conversation.messages.push(question, answer); conversation.updatedAt = createdAt;
    if (!conversation.renamed && conversation.messages.length === 2) conversation.title = question.text.replace(/\s+/g, ' ').slice(0, 60);
    const controller = new AbortController(); this.jobs.set(id, { controller, conversation });
    const timeout = setTimeout(() => controller.abort(), 600_000); timeout.unref();
    const disconnected = () => { if (!res.writableEnded) controller.abort(); }; res.on('close', disconnected);
    const emit = (event, data) => { if (!res.destroyed && !res.writableEnded) res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`); };
    let heartbeat;
    try {
      await this.conversations.save(conversation);
      res.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-store', 'X-Accel-Buffering': 'no', 'X-Content-Type-Options': 'nosniff' }); res.flushHeaders();
      heartbeat = setInterval(() => { if (!res.destroyed) res.write(': heartbeat\n\n'); }, 15_000); heartbeat.unref();
      emit('conversation', publicConversation(conversation)); let savedAt = Date.now();
      for await (const delta of this.provider.respond(conversation, value.model, controller.signal, effort)) {
        if (controller.signal.aborted) break;
        answer.text += delta; emit('delta', { id: answer.id, text: delta });
        if (answer.text.length > 200_000) { controller.abort(); break; }
        if (Date.now() - savedAt > 1000) { await this.conversations.save(conversation); savedAt = Date.now(); }
      }
      answer.status = controller.signal.aborted ? 'interrupted' : 'completed';
      if (answer.status === 'interrupted') answer.error = '回答已停止，生成的内容已保留。';
    } catch (error) {
      answer.status = controller.signal.aborted ? 'interrupted' : 'failed';
      answer.error = controller.signal.aborted ? '回答已停止或连接中断，生成的内容已保留。' : error instanceof ApiError ? error.message : '生成回答失败，请检查网络后重试';
    } finally {
      clearTimeout(timeout); clearInterval(heartbeat); res.off('close', disconnected); conversation.updatedAt = new Date().toISOString();
      try { await this.conversations.save(conversation); emit('conversation', publicConversation(conversation)); }
      catch { emit('error', { error: '对话保存失败，请保留当前页面并检查磁盘空间' }); }
      this.jobs.delete(id); if (!res.destroyed) res.end();
    }
  }
}
