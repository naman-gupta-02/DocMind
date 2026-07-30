import { GoogleGenerativeAI } from '@google/generative-ai';
import type { RetrievedChunk, Logger } from '@docmind/shared';

export interface RerankOptions {
  apiKey: string;
  modelName: string;
  enabled: boolean;
  topN?: number;
  logger?: Logger;
}

/**
 * Optional LLM-based reranking: asks a cheap Gemini model to score each RRF candidate's
 * relevance to the query and keeps only the top N. Falls back to the RRF order (still capped
 * at topN) if reranking is disabled or the model call/parse fails for any reason — reranking is
 * a quality improvement, not a correctness dependency.
 */
export async function rerankChunks(
  query: string,
  chunks: RetrievedChunk[],
  options: RerankOptions,
): Promise<RetrievedChunk[]> {
  const { apiKey, modelName, enabled, topN = 5, logger } = options;

  if (!enabled || chunks.length <= topN) {
    return chunks.slice(0, topN);
  }

  try {
    const client = new GoogleGenerativeAI(apiKey);
    const model = client.getGenerativeModel({
      model: modelName,
      generationConfig: { responseMimeType: 'application/json' },
    });

    const prompt = [
      'Score how relevant each excerpt is to the query on a 0-10 scale.',
      'Respond with ONLY a JSON array of numbers in the same order as the excerpts, e.g. [7,2,9].',
      `Query: ${query}`,
      ...chunks.map((c, i) => `Excerpt ${i + 1}: ${c.text.slice(0, 500)}`),
    ].join('\n\n');

    const result = await model.generateContent(prompt);
    const scores = JSON.parse(result.response.text()) as number[];

    return chunks
      .map((chunk, i) => ({ chunk, rerankScore: scores[i] ?? 0 }))
      .sort((a, b) => b.rerankScore - a.rerankScore)
      .slice(0, topN)
      .map((x) => x.chunk);
  } catch (err) {
    logger?.warn({ err }, 'Rerank call failed — falling back to RRF order');
    return chunks.slice(0, topN);
  }
}
