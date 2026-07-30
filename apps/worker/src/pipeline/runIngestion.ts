import { readFile } from 'node:fs/promises';
import type { Redis } from 'ioredis';
import { ChunkModel, DocumentModel, type EmbeddingProvider, type SupportedExt } from '@docmind/shared';
import { parseDocument } from './parse';
import { chunkSegments } from './chunk';
import { updateStage, markFailed } from './notify';

export interface RunIngestionOptions {
  chunkSize: number;
  chunkOverlap: number;
}

export async function runIngestion(
  documentId: string,
  redis: Redis,
  embeddingProvider: EmbeddingProvider,
  options: RunIngestionOptions,
): Promise<void> {
  const document = await DocumentModel.findById(documentId);
  if (!document) {
    throw new Error(`Document ${documentId} not found`);
  }

  try {
    await updateStage(redis, documentId, 'parsing', 'Parsing document');
    const buffer = await readFile(document.storagePath);
    const parsed = await parseDocument(buffer, document.ext as SupportedExt);

    await updateStage(redis, documentId, 'chunking', 'Splitting into chunks');
    const chunks = chunkSegments(parsed.segments, options);
    if (chunks.length === 0) {
      throw new Error('Document produced no extractable text');
    }

    await updateStage(redis, documentId, 'embedding', `Embedding ${chunks.length} chunks`);
    const embeddings = await embeddingProvider.embed(chunks.map((c) => c.text));

    await updateStage(redis, documentId, 'indexing', 'Writing chunks to MongoDB Atlas');
    await ChunkModel.insertMany(
      chunks.map((chunk, i) => ({
        documentId: document._id,
        chunkIndex: chunk.chunkIndex,
        text: chunk.text,
        page: chunk.page,
        lineStart: chunk.lineStart,
        lineEnd: chunk.lineEnd,
        charStart: chunk.charStart,
        charEnd: chunk.charEnd,
        embedding: embeddings[i] ?? [],
        embeddingModel: embeddingProvider.modelName,
      })),
    );

    document.pageCount = parsed.pageCount;
    document.chunkCount = chunks.length;
    await document.save();

    await updateStage(redis, documentId, 'completed', 'Ingestion complete');
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown ingestion error';
    await markFailed(redis, documentId, message);
    throw err;
  }
}
