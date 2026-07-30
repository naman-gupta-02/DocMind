export interface ChunkOptions {
  chunkSize?: number;
  chunkOverlap?: number;
  separators?: string[];
}

export interface TextChunk {
  text: string;
  /** Character offset (inclusive) into the input text. */
  start: number;
  /** Character offset (exclusive) into the input text. */
  end: number;
}

interface Piece {
  text: string;
  start: number;
  end: number;
}

/** Priority order: paragraph breaks, then lines, then sentence punctuation, then words, then raw chars. */
const DEFAULT_SEPARATORS = ['\n\n', '\n', '. ', '! ', '? ', '; ', ', ', ' ', ''];

function splitOnSeparator(piece: Piece, separator: string): Piece[] {
  if (separator === '') {
    const chars: Piece[] = [];
    for (let i = 0; i < piece.text.length; i++) {
      chars.push({ text: piece.text[i] as string, start: piece.start + i, end: piece.start + i + 1 });
    }
    return chars;
  }

  const result: Piece[] = [];
  let cursor = 0;
  while (cursor <= piece.text.length) {
    const nextIdx = piece.text.indexOf(separator, cursor);
    if (nextIdx === -1) {
      const rest = piece.text.slice(cursor);
      if (rest.length > 0) {
        result.push({ text: rest, start: piece.start + cursor, end: piece.start + cursor + rest.length });
      }
      break;
    }
    const segmentEnd = nextIdx + separator.length;
    const segment = piece.text.slice(cursor, segmentEnd);
    result.push({ text: segment, start: piece.start + cursor, end: piece.start + segmentEnd });
    cursor = segmentEnd;
  }
  return result;
}

function recursiveSplit(piece: Piece, separators: string[], chunkSize: number): Piece[] {
  if (piece.text.length <= chunkSize) return [piece];

  const [separator, ...rest] = separators;
  if (separator === undefined) {
    const hardCut: Piece[] = [];
    for (let i = 0; i < piece.text.length; i += chunkSize) {
      const segment = piece.text.slice(i, i + chunkSize);
      hardCut.push({ text: segment, start: piece.start + i, end: piece.start + i + segment.length });
    }
    return hardCut;
  }

  const pieces = splitOnSeparator(piece, separator);
  if (pieces.length <= 1) {
    return recursiveSplit(piece, rest, chunkSize);
  }

  const result: Piece[] = [];
  for (const p of pieces) {
    if (p.text.length > chunkSize) {
      result.push(...recursiveSplit(p, rest, chunkSize));
    } else {
      result.push(p);
    }
  }
  return result;
}

function mergePieces(pieces: Piece[], chunkSize: number, chunkOverlap: number): TextChunk[] {
  const chunks: TextChunk[] = [];
  let current: Piece[] = [];
  let currentLen = 0;

  const flush = () => {
    if (current.length === 0) return;
    chunks.push({
      text: current.map((p) => p.text).join(''),
      start: (current[0] as Piece).start,
      end: (current[current.length - 1] as Piece).end,
    });
  };

  for (const piece of pieces) {
    if (currentLen + piece.text.length > chunkSize && currentLen > 0) {
      flush();

      // Carry a trailing overlap window into the next chunk.
      const tail: Piece[] = [];
      let overlapLen = 0;
      for (let i = current.length - 1; i >= 0; i--) {
        const p = current[i] as Piece;
        if (overlapLen >= chunkOverlap) break;
        tail.unshift(p);
        overlapLen += p.text.length;
      }
      current = tail;
      currentLen = overlapLen;
    }
    current.push(piece);
    currentLen += piece.text.length;
  }
  flush();

  return chunks;
}

/**
 * Recursive, sentence-aware text splitter. Tries paragraph breaks first, then falls back to
 * sentence punctuation, then words, then raw characters — only falling back when a segment at
 * the current granularity still exceeds chunkSize. Returned chunks carry char offsets into the
 * original text so callers can map chunks back to exact source locations for citations.
 */
export function splitText(text: string, options: ChunkOptions = {}): TextChunk[] {
  const chunkSize = options.chunkSize ?? 1000;
  const chunkOverlap = options.chunkOverlap ?? 150;
  const separators = options.separators ?? DEFAULT_SEPARATORS;

  if (chunkOverlap >= chunkSize) {
    throw new Error('chunkOverlap must be smaller than chunkSize');
  }
  if (text.length === 0) return [];

  const pieces = recursiveSplit({ text, start: 0, end: text.length }, separators, chunkSize);
  return mergePieces(pieces, chunkSize, chunkOverlap).filter((c) => c.text.trim().length > 0);
}
