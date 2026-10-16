import crypto from 'node:crypto';
import path from 'node:path';
import { promises as fs } from 'node:fs';
import { ApiError, validId } from './storage.mjs';

const now = () => new Date().toISOString();
const check = (condition, message) => { if (!condition) throw new ApiError(400, message); };
async function atomic(file, value) { const tmp = file + '.' + crypto.randomUUID() + '.tmp'; try { await fs.writeFile(tmp, JSON.stringify(value, null, 2)); await fs.rename(tmp, file); } finally { await fs.rm(tmp, { force: true }).catch(() => {}); } }
export function validateContext(value) {
  if (value == null) return null;
  check(['document', 'selection', 'page', 'image'].includes(value.kind), '文献上下文类型无效');
  check(typeof value.text === 'string' && value.text.length <= 350_000, '文献内容过长，请选择段落提问');
  check(value.page === undefined || Number.isInteger(value.page) && value.page > 0 && value.page < 100_000, '文献页码无效');
  check(value.pages === undefined || Number.isInteger(value.pages) && value.pages > 0 && value.pages < 100_000, '文献页数无效');
  if (value.image) check(typeof value.image === 'string' && value.image.length <= 3_000_000 && /^data:image\/(png|jpeg);base64,[A-Za-z0-9+/]+=*$/.test(value.image), '图片上下文无效或过大');
  check(value.text.trim() || value.image, '没有可发送的文献内容');
  return { kind: value.kind, text: value.text, ...(value.page ? { page: value.page } : {}), ...(value.pages ? { pages: value.pages } : {}), ...(value.image ? { image: value.image } : {}) };
}
export function publicConversation(conversation) {
  return { ...conversation, documentContext: undefined, hasDocumentContext: !!conversation.documentContext, messages: conversation.messages.map(message => ({ ...message, context: message.context ? { ...message.context, image: undefined, hasImage: !!message.context.image } : undefined })) };
}
export class ConversationStore {
  constructor(directory) { this.directory = path.join(directory, 'conversations'); this.queue = Promise.resolve(); }
  async init() {
    await fs.mkdir(this.directory, { recursive: true });
    for (const item of await this.all()) { let changed = false; for (const message of item.messages) if (message.status === 'streaming') { message.status = 'interrupted'; message.error = '本地服务已重新启动，回答未完成。可以继续提问。'; changed = true; } if (changed) await this.save(item); }
  }
  file(id) { return path.join(this.directory, validId(id) + '.json'); }
  async get(id) { try { return JSON.parse(await fs.readFile(this.file(id), 'utf8')); } catch (error) { if (error.code === 'ENOENT') throw new ApiError(404, '对话不存在或已删除'); throw error; } }
  async all() { const entries = await fs.readdir(this.directory); return Promise.all(entries.filter(name => /^[A-Za-z0-9_-]{1,100}\.json$/.test(name)).map(name => this.get(name.slice(0, -5)))); }
  save(conversation) { const snapshot = structuredClone(conversation); const next = this.queue.catch(() => {}).then(() => atomic(this.file(snapshot.id), snapshot)); this.queue = next; return next; }
  async create(value, localStore) {
    check(value && typeof value.fileId === 'string', '请从文献阅读页创建对话');
    const info = await localStore.info(validId(value.fileId));
    const workspace = await localStore.workspace();
    const node = workspace?.boards.find(board => board.id === value.anchor?.boardId)?.nodes.find(node => node.id === value.anchor?.nodeId && node.type === 'paper' && node.data.fileId === value.fileId);
    check(node, '关联的文献卡片不存在');
    const conversation = { version: 1, id: crypto.randomUUID(), title: '新的文献对话', source: { fileId: value.fileId, title: node.data.title, fileName: info.name, kind: info.kind, anchor: { boardId: value.anchor.boardId, nodeId: value.anchor.nodeId } }, messages: [], createdAt: now(), updatedAt: now() };
    await this.save(conversation); return publicConversation(conversation);
  }
  async list(params) {
    const query = (params.get('q') || '').trim().toLocaleLowerCase().slice(0, 200), fileId = params.get('fileId');
    const page = Math.max(1, Math.min(100_000, Math.floor(Number(params.get('page')) || 1))), pageSize = 20;
    const all = (await this.all()).filter(item => (!fileId || item.source.fileId === fileId) && (!query || [item.title, item.source.title, item.source.fileName, ...item.messages.map(message => message.text)].some(text => text.toLocaleLowerCase().includes(query)))).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    return { items: all.slice((page - 1) * pageSize, page * pageSize).map(item => ({ id: item.id, title: item.title, source: item.source, createdAt: item.createdAt, updatedAt: item.updatedAt, messageCount: item.messages.length, excerpt: item.messages.at(-1)?.text.slice(0, 180) || '还没有消息', status: item.messages.at(-1)?.status })), total: all.length, page, pageSize };
  }
  async rename(id, title) { check(typeof title === 'string' && title.trim().length > 0 && title.length <= 160, '对话名称需为 1–160 个字符'); const item = await this.get(id); item.title = title.trim(); item.renamed = true; item.updatedAt = now(); await this.save(item); return publicConversation(item); }
  async remove(id) { await this.get(id); await this.queue; await fs.unlink(this.file(id)); }
  async linkNote(id, messageId, anchor) {
    const item = await this.get(id), message = item.messages.find(message => message.id === messageId && message.role === 'assistant');
    check(message, '回答不存在'); validId(anchor?.boardId); validId(anchor?.nodeId); message.noteAnchor = anchor; await this.save(item); return publicConversation(item);
  }
}
