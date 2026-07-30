export interface Bm25Document {
  id: string;
  text: string;
}

export interface Bm25Options {
  k1?: number;
  b?: number;
}

function tokenize(text: string): string[] {
  return text.toLowerCase().match(/[a-z0-9]+/g) ?? [];
}

/** Small BM25 implementation (TF saturation + IDF + document-length normalization). */
export function bm25Score(
  query: string,
  corpus: Bm25Document[],
  options: Bm25Options = {},
): Array<{ id: string; score: number }> {
  const { k1 = 1.5, b = 0.75 } = options;
  const queryTerms = tokenize(query);
  const docTokens = corpus.map((doc) => tokenize(doc.text));
  const docLengths = docTokens.map((tokens) => tokens.length);
  const totalLength = docLengths.reduce((sum, len) => sum + len, 0);
  const avgdl = totalLength / (docLengths.length || 1);
  const N = corpus.length;

  const documentFrequency = new Map<string, number>();
  for (const tokens of docTokens) {
    for (const term of new Set(tokens)) {
      documentFrequency.set(term, (documentFrequency.get(term) ?? 0) + 1);
    }
  }

  function idf(term: string): number {
    const n = documentFrequency.get(term) ?? 0;
    return Math.log((N - n + 0.5) / (n + 0.5) + 1);
  }

  return corpus.map((doc, i) => {
    const tokens = docTokens[i] as string[];
    const termFrequency = new Map<string, number>();
    for (const term of tokens) {
      termFrequency.set(term, (termFrequency.get(term) ?? 0) + 1);
    }

    let score = 0;
    const docLength = docLengths[i] as number;
    for (const term of queryTerms) {
      const f = termFrequency.get(term) ?? 0;
      if (f === 0) continue;
      const numerator = f * (k1 + 1);
      const denominator = f + k1 * (1 - b + (b * docLength) / (avgdl || 1));
      score += idf(term) * (numerator / denominator);
    }

    return { id: doc.id, score };
  });
}
