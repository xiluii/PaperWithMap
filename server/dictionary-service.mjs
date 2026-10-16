import { ApiError } from './storage.mjs';

// Public dictionary lookup only. This module has no connection to the AI service.
export class DictionaryService {
  constructor({ fetch: request = globalThis.fetch, timeout = 8000 } = {}) {
    this.request = request;
    this.timeout = timeout;
    this.cache = new Map();
  }

  async lookup(value, { signal } = {}) {
    if (typeof value !== 'string') throw new ApiError(400, '请选择需要查询的单词或短语');
    const query = value.replace(/-\s*\n\s*/g, '').replace(/\s+/g, ' ').trim()
      .replace(/^["“”‘’(),.;:!?，。；：！？]+|["“”‘’(),.;:!?，。；：！？]+$/g, '').trim();
    if (!query || !/\p{L}/u.test(query)) throw new ApiError(400, '请选择包含文字的单词或短语');
    if (query.length > 120 || query.split(' ').length > 20 || Buffer.byteLength(query) > 500) {
      throw new ApiError(400, '词典仅查询单词或短语，请将选区缩短至 120 字符、20 个词以内');
    }
    const key = query.toLocaleLowerCase('en-US'), cached = this.cache.get(key);
    if (cached && Date.now() - cached.time < 30 * 60_000) return { ...cached.result, query };
    const url = new URL('https://dict.youdao.com/jsonapi');
    url.search = new URLSearchParams({ q: query, dicts: JSON.stringify({ count: 3, dicts: [['ec', 'ce', 'simple']] }) }).toString();
    let data;
    try {
      const response = await this.request(url, {
        signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(this.timeout)]) : AbortSignal.timeout(this.timeout),
        headers: { Accept: 'application/json' }, redirect: 'error',
      });
      if (!response.ok) throw new Error('Upstream unavailable');
      const content = await response.text();
      if (content.length > 512_000) throw new Error('Invalid dictionary response');
      data = JSON.parse(content);
      if (!data || typeof data !== 'object' || typeof data.input !== 'string' || data.input !== query) throw new Error('Invalid dictionary response');
    } catch {
      if (signal?.aborted) throw new ApiError(499, '词典查询已取消');
      throw new ApiError(502, '暂时无法连接有道词典，请检查网络后重试');
    }
    const words = data.ec?.word || data.ce?.word || [];
    const word = Array.isArray(words) ? words[0] : null;
    const plain = item => typeof item === 'string' ? item : typeof item?.['#text'] === 'string' ? item['#text'] : '';
    const definitions = [];
    for (const group of Array.isArray(word?.trs) ? word.trs : []) {
      for (const item of Array.isArray(group?.tr) ? group.tr : []) {
        const line = item?.l, values = Array.isArray(line?.i) ? line.i : [line?.i];
        const text = values.map(plain).join('').trim();
        if (text) definitions.push(`${typeof line?.pos === 'string' ? line.pos + ' ' : ''}${text}`.slice(0, 2000));
        if (definitions.length >= 12) break;
      }
      if (definitions.length >= 12) break;
    }
    const phrase = word?.['return-phrase']?.l?.i;
    const result = {
      query, provider: 'youdao', found: definitions.length > 0,
      headword: typeof phrase === 'string' ? phrase.slice(0, 200) : query,
      definitions: [...new Set(definitions)],
      pronunciations: Object.fromEntries([['uk', word?.ukphone], ['us', word?.usphone], ['other', word?.phone]].filter(([, value]) => typeof value === 'string' && value.length < 150)),
      url: `https://dict.youdao.com/result?${new URLSearchParams({ word: query, lang: 'en' })}`,
    };
    this.cache.delete(key);
    this.cache.set(key, { time: Date.now(), result });
    if (this.cache.size > 200) this.cache.delete(this.cache.keys().next().value);
    return result;
  }
}
