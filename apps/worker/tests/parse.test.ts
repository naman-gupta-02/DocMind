import { describe, expect, it } from 'vitest';
import { parseDocument } from '../src/pipeline/parse';

describe('parseDocument', () => {
  it('parses plain text as a single page-1 segment', async () => {
    const buffer = Buffer.from('Hello DocMind.\nSecond line.');
    const result = await parseDocument(buffer, 'txt');

    expect(result.pageCount).toBe(1);
    expect(result.segments).toHaveLength(1);
    expect(result.segments[0]?.page).toBe(1);
    expect(result.segments[0]?.text).toBe('Hello DocMind.\nSecond line.');
  });

  it('parses markdown the same way as plain text', async () => {
    const buffer = Buffer.from('# Heading\n\nSome **bold** content.');
    const result = await parseDocument(buffer, 'md');

    expect(result.pageCount).toBe(1);
    expect(result.segments[0]?.text).toContain('# Heading');
  });
});
