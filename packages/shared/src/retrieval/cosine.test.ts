import { describe, expect, it } from 'vitest';
import { cosineSimilarity } from './cosine';

describe('cosineSimilarity', () => {
  it('returns 1 for identical vectors', () => {
    expect(cosineSimilarity([1, 2, 3], [1, 2, 3])).toBeCloseTo(1, 5);
  });

  it('returns 0 for orthogonal vectors', () => {
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0, 5);
  });

  it('returns -1 for opposite vectors', () => {
    expect(cosineSimilarity([1, 0], [-1, 0])).toBeCloseTo(-1, 5);
  });

  it('returns 0 for a zero vector to avoid division by zero', () => {
    expect(cosineSimilarity([0, 0, 0], [1, 2, 3])).toBe(0);
  });

  it('scales similarity between 0 and 1 for similar-but-not-identical vectors', () => {
    const score = cosineSimilarity([1, 1, 0], [1, 0.9, 0.1]);
    expect(score).toBeGreaterThan(0.9);
    expect(score).toBeLessThan(1);
  });
});
