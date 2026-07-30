import { splitText } from '@docmind/shared';
import type { ParsedSegment } from './parse';

export interface DocumentChunk {
  chunkIndex: number;
  text: string;
  page: number;
  lineStart: number;
  lineEnd: number;
  charStart: number;
  charEnd: number;
}

/** 1-based line number of the given character offset within `text`. */
function lineNumberAt(text: string, offset: number): number {
  let line = 1;
  const bound = Math.min(offset, text.length);
  for (let i = 0; i < bound; i++) {
    if (text[i] === '\n') line++;
  }
  return line;
}

export interface ChunkingOptions {
  chunkSize: number;
  chunkOverlap: number;
}

export function chunkSegments(segments: ParsedSegment[], options: ChunkingOptions): DocumentChunk[] {
  const chunks: DocumentChunk[] = [];
  let chunkIndex = 0;

  for (const segment of segments) {
    const textChunks = splitText(segment.text, options);
    for (const tc of textChunks) {
      chunks.push({
        chunkIndex: chunkIndex++,
        text: tc.text,
        page: segment.page,
        lineStart: lineNumberAt(segment.text, tc.start),
        lineEnd: lineNumberAt(segment.text, tc.end),
        charStart: tc.start,
        charEnd: tc.end,
      });
    }
  }

  return chunks;
}
