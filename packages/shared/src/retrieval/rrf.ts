export interface RankableItem {
  id: string;
  score: number;
}

/**
 * Reciprocal Rank Fusion: merges several independently-scored rankings of the same item pool
 * into one fused ranking using only rank position (not the raw scores, which live on
 * incompatible scales — cosine similarity vs BM25 vs a Lucene search score). This *is* the
 * "hybrid" in hybrid search.
 */
export function reciprocalRankFusion(rankedLists: RankableItem[][], k = 60): Array<{ id: string; score: number }> {
  const fused = new Map<string, number>();

  for (const list of rankedLists) {
    const sorted = [...list].sort((a, b) => b.score - a.score);
    sorted.forEach((item, index) => {
      const rank = index + 1;
      fused.set(item.id, (fused.get(item.id) ?? 0) + 1 / (k + rank));
    });
  }

  return Array.from(fused.entries())
    .map(([id, score]) => ({ id, score }))
    .sort((a, b) => b.score - a.score);
}
