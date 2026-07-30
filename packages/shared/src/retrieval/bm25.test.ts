import { describe, expect, it } from 'vitest';
import { bm25Score } from './bm25';

describe('bm25Score', () => {
  const corpus = [
    { id: 'a', text: 'The quick brown fox jumps over the lazy dog' },
    { id: 'b', text: 'Retrieval augmented generation combines search with language models' },
    { id: 'c', text: 'The dog barked at the fox in the yard' },
  ];

  it('scores documents containing the query terms higher than those without', () => {
    const scores = bm25Score('fox dog', corpus);
    const byId = new Map(scores.map((s) => [s.id, s.score]));
    expect(byId.get('a')!).toBeGreaterThan(byId.get('b')!);
    expect(byId.get('c')!).toBeGreaterThan(byId.get('b')!);
  });

  it('gives a zero score to documents with no matching terms', () => {
    const scores = bm25Score('retrieval augmented generation', corpus);
    const byId = new Map(scores.map((s) => [s.id, s.score]));
    expect(byId.get('b')!).toBeGreaterThan(0);
    expect(byId.get('a')!).toBe(0);
    expect(byId.get('c')!).toBe(0);
  });

  it('returns a score for every document in the corpus', () => {
    const scores = bm25Score('anything', corpus);
    expect(scores).toHaveLength(corpus.length);
  });

  it('handles an empty query gracefully', () => {
    const scores = bm25Score('', corpus);
    expect(scores.every((s) => s.score === 0)).toBe(true);
  });
});
