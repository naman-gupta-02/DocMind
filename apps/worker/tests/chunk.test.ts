import { describe, expect, it } from 'vitest';
import { chunkSegments } from '../src/pipeline/chunk';
import type { ParsedSegment } from '../src/pipeline/parse';

describe('chunkSegments', () => {
  it('tags each chunk with the page number of its source segment', () => {
    const segments: ParsedSegment[] = [
      { page: 1, text: 'Page one content. It has a couple of sentences in it.' },
      { page: 2, text: 'Page two content. It also has a couple of sentences.' },
    ];

    const chunks = chunkSegments(segments, { chunkSize: 1000, chunkOverlap: 50 });

    expect(chunks).toHaveLength(2);
    expect(chunks[0]?.page).toBe(1);
    expect(chunks[1]?.page).toBe(2);
  });

  it('assigns sequential chunkIndex across all segments', () => {
    const segments: ParsedSegment[] = [
      { page: 1, text: 'a'.repeat(300) },
      { page: 2, text: 'b'.repeat(300) },
    ];

    const chunks = chunkSegments(segments, { chunkSize: 100, chunkOverlap: 20 });

    chunks.forEach((chunk, i) => expect(chunk.chunkIndex).toBe(i));
  });

  it('computes 1-based line numbers relative to the segment text', () => {
    const segments: ParsedSegment[] = [{ page: 1, text: 'line one\nline two\nline three' }];

    const chunks = chunkSegments(segments, { chunkSize: 5, chunkOverlap: 1 });

    for (const chunk of chunks) {
      expect(chunk.lineStart).toBeGreaterThanOrEqual(1);
      expect(chunk.lineEnd).toBeGreaterThanOrEqual(chunk.lineStart);
    }
  });
});
