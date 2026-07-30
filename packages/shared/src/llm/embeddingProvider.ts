import { GoogleGenerativeAI } from '@google/generative-ai';
import { withRetry } from './retry';

export interface EmbeddingProvider {
  readonly modelName: string;
  embed(texts: string[]): Promise<number[][]>;
}

const BATCH_SIZE = 10;

export class GeminiEmbeddingProvider implements EmbeddingProvider {
  readonly modelName = 'gemini-embedding-001';
  private readonly client: GoogleGenerativeAI;

  constructor(apiKey: string) {
    this.client = new GoogleGenerativeAI(apiKey);
  }

  async embed(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];
    const model = this.client.getGenerativeModel({ model: this.modelName });
    const results: number[][] = [];

    for (let i = 0; i < texts.length; i += BATCH_SIZE) {
      const batch = texts.slice(i, i + BATCH_SIZE);
      const response = await withRetry(() =>
        model.batchEmbedContents({
          requests: batch.map((text) => ({
            content: { role: 'user', parts: [{ text }] },
          })),
        }),
      );
      results.push(...response.embeddings.map((e) => e.values));
    }

    return results;
  }
}

export type EmbeddingProviderName = 'gemini';

export function createEmbeddingProvider(provider: EmbeddingProviderName, apiKey: string): EmbeddingProvider {
  switch (provider) {
    case 'gemini':
      return new GeminiEmbeddingProvider(apiKey);
    default: {
      const exhaustiveCheck: never = provider;
      throw new Error(`Unknown embedding provider: ${exhaustiveCheck}`);
    }
  }
}
