import { describe, expect, it } from 'vitest';
import { splitText } from './splitText';

describe('splitText', () => {
  it('returns a single chunk when text fits under chunkSize', () => {
    const text = 'This is a short sentence.';
    const chunks = splitText(text, { chunkSize: 1000, chunkOverlap: 100 });
    expect(chunks).toHaveLength(1);
    expect(chunks[0]?.text).toBe(text);
    expect(chunks[0]?.start).toBe(0);
    expect(chunks[0]?.end).toBe(text.length);
  });

  it('returns no chunks for empty text', () => {
    expect(splitText('')).toEqual([]);
  });

  it('splits long text into multiple chunks respecting chunkSize', () => {
    const sentence = 'The quick brown fox jumps over the lazy dog. ';
    const text = sentence.repeat(50); // 2300 chars
    const chunks = splitText(text, { chunkSize: 300, chunkOverlap: 50 });
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(chunk.text.length).toBeLessThanOrEqual(300 + sentence.length);
    }
  });

  it('prefers sentence boundaries over hard cuts when possible', () => {
    const text = 'Alpha sentence one. Beta sentence two. Gamma sentence three. Delta sentence four.';
    const chunks = splitText(text, { chunkSize: 40, chunkOverlap: 5 });
    for (const chunk of chunks) {
      const trimmed = chunk.text.trim();
      // Every chunk should end at a sentence boundary or be the final trailing fragment.
      const endsCleanly = /[.!?]$/.test(trimmed) || chunk === chunks[chunks.length - 1];
      expect(endsCleanly).toBe(true);
    }
  });

  it('produces overlapping content between consecutive chunks', () => {
    const sentence = 'Sentence number marker XYZ appears here for overlap detection. ';
    const text = sentence.repeat(20);
    const chunks = splitText(text, { chunkSize: 200, chunkOverlap: 60 });
    expect(chunks.length).toBeGreaterThan(1);
    for (let i = 1; i < chunks.length; i++) {
      const prevEnd = chunks[i - 1]?.end ?? 0;
      const currentStart = chunks[i]?.start ?? 0;
      // Overlap means the next chunk starts before the previous one ended.
      expect(currentStart).toBeLessThan(prevEnd);
    }
  });

  it('char offsets map back to the exact substring of the source text', () => {
    const text =
      'Paragraph one has some content.\n\nParagraph two has different content that is a bit longer than the first.\n\nParagraph three wraps things up.';
    const chunks = splitText(text, { chunkSize: 50, chunkOverlap: 10 });
    for (const chunk of chunks) {
      expect(text.slice(chunk.start, chunk.end)).toBe(chunk.text);
    }
  });

  it('falls back to hard character cuts for a single run-on token with no separators', () => {
    const text = 'a'.repeat(500);
    const chunks = splitText(text, { chunkSize: 100, chunkOverlap: 20 });
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(chunk.text.length).toBeLessThanOrEqual(100);
    }
  });

  it('throws if chunkOverlap is not smaller than chunkSize', () => {
    expect(() => splitText('hello world', { chunkSize: 10, chunkOverlap: 10 })).toThrow();
  });
});
