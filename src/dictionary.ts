export type DictionaryEntry = {
  query: string;
  provider: 'youdao';
  found: boolean;
  headword: string;
  definitions: string[];
  pronunciations: { uk?: string; us?: string; other?: string };
  url: string;
};

export function dictionaryQuery(text: string) {
  return text.replace(/-\s*\n\s*/g, '').replace(/\s+/g, ' ').trim()
    .replace(/^["“”‘’(),.;:!?，。；：！？]+|["“”‘’(),.;:!?，。；：！？]+$/g, '').trim();
}

export function dictionarySelectionError(query: string) {
  if (!query || !/\p{L}/u.test(query)) return '请选择包含文字的单词或短语';
  if (query.length > 120 || query.split(' ').length > 20 || new TextEncoder().encode(query).length > 500) {
    return '词典仅查询单词或短语，请将选区缩短至 120 字符、20 个词以内';
  }
  return '';
}

export async function lookupDictionary(text: string, signal: AbortSignal): Promise<DictionaryEntry> {
  const response = await fetch('/api/dictionary/lookup', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text }), signal,
  });
  let value;
  try { value = await response.json(); } catch { throw new Error('本地词典服务不可用，请确认后端已启动'); }
  if (!response.ok) throw new Error(value.error || '词典查询失败，请重试');
  return value;
}
