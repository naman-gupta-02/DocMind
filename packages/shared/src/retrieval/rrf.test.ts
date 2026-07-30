import { describe, expect, it } from 'vitest';
import { reciprocalRankFusion } from './rrf';

describe('reciprocalRankFusion', () => {
  it('ranks an item found near the top of both lists above one found in only one list', () => {
    const vectorRank = [
      { id: 'x', score: 0.95 },
      { id: 'y', score: 0.9 },
      { id: 'z', score: 0.5 },
    ];
    const keywordRank = [
      { id: 'y', score: 10 },
      { id: 'x', score: 8 },
    ];

    const fused = reciprocalRankFusion([vectorRank, keywordRank]);
    const ids = fused.map((f) => f.id);

    // x and y each appear at rank {1,2} across the two lists (a tie by construction); both
    // must outrank z, which only appears once and at the bottom of its one list.
    expect(ids.slice(0, 2).sort()).toEqual(['x', 'y']);
    expect(ids[2]).toBe('z');
    expect(fused.find((f) => f.id === 'y')!.score).toBeGreaterThan(fused.find((f) => f.id === 'z')!.score);
  });

  it('ranks an item appearing near the top of one list above a tied pair when it breaks the tie', () => {
    const vectorRank = [
      { id: 'a', score: 0.99 },
      { id: 'b', score: 0.8 },
    ];
    const keywordRank = [
      { id: 'a', score: 12 },
      { id: 'b', score: 1 },
    ];

    const fused = reciprocalRankFusion([vectorRank, keywordRank]);
    expect(fused[0]?.id).toBe('a');
    expect(fused[0]!.score).toBeGreaterThan(fused[1]!.score);
  });

  it('sorts inputs by score internally regardless of input order', () => {
    const unsorted = [
      { id: 'low', score: 0.1 },
      { id: 'high', score: 0.9 },
    ];
    const fused = reciprocalRankFusion([unsorted]);
    expect(fused[0]?.id).toBe('high');
  });

  it('returns an empty array for empty input', () => {
    expect(reciprocalRankFusion([])).toEqual([]);
  });
});
