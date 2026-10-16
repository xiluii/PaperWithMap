import { describe, expect, it } from 'vitest';
import { dictionaryQuery, dictionarySelectionError } from './dictionary';

describe('dictionary selection boundaries', () => {
  it('normalizes PDF line breaks and punctuation without changing compound terms', () => {
    expect(dictionaryQuery('  “neural\nnetwork,” ')).toBe('neural network');
    expect(dictionaryQuery('re-\nsearch')).toBe('research');
    expect(dictionaryQuery('self-attention')).toBe('self-attention');
    expect(dictionaryQuery('C++')).toBe('C++');
  });
  it('allows English and Chinese words but rejects whole paragraphs and numeric formulas before any request', () => {
    expect(dictionarySelectionError('neural network')).toBe('');
    expect(dictionarySelectionError('研究')).toBe('');
    expect(dictionarySelectionError('123 + 456')).not.toBe('');
    expect(dictionarySelectionError('word '.repeat(21).trim())).not.toBe('');
    expect(dictionarySelectionError('x'.repeat(121))).not.toBe('');
  });
});
