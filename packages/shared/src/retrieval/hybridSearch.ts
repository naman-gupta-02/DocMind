import { Types } from 'mongoose';
import { ChunkModel } from '../db/models/chunk.model';
import { ATLAS_VECTOR_INDEX, ATLAS_TEXT_INDEX, EMBEDDING_DIMENSIONS } from '../constants';
import { cosineSimilarity } from './cosine';
import { bm25Score } from './bm25';
import { reciprocalRankFusion } from './rrf';
import { createLogger } from '../logger';

const logger = createLogger('retrieval');

export interface RetrievedChunk {
  chunkId: string;
  documentId: string;
  text: string;
  page: number;
  lineStart?: number;
  lineEnd?: number;
  score: number;
  cosineScore: number;
}

export interface HybridSearchOptions {
  queryText: string;
  queryEmbedding: number[];
  documentIds: string[];
  topK?: number;
  similarityThreshold?: number;
}

interface CandidateDoc {
  chunkId: string;
  documentId: string;
  text: string;
  page: number;
  lineStart?: number;
  lineEnd?: number;
  embedding: number[];
}

// Cached per-process: whether the connected Mongo deployment supports Atlas-only aggregation
// stages ($vectorSearch / $search). A self-hosted/local mongod does not — probing once avoids
// requiring a config flag the user has to remember to flip when they move to real Atlas.
let atlasSupport: boolean | null = null;

async function detectAtlasSupport(): Promise<boolean> {
  if (atlasSupport !== null) return atlasSupport;
  try {
    await ChunkModel.aggregate([
      {
        $vectorSearch: {
          index: ATLAS_VECTOR_INDEX,
          path: 'embedding',
          queryVector: new Array(EMBEDDING_DIMENSIONS).fill(0),
          numCandidates: 1,
          limit: 1,
        },
      },
    ]);
    atlasSupport = true;
    logger.info('Atlas Vector Search / Search detected — using native $vectorSearch + $search');
  } catch {
    atlasSupport = false;
    logger.warn('Atlas Vector Search not available on this Mongo deployment — falling back to in-process hybrid search');
  }
  return atlasSupport;
}

function toCandidate(doc: {
  _id: Types.ObjectId;
  documentId: Types.ObjectId;
  text: string;
  page: number;
  lineStart?: number | null;
  lineEnd?: number | null;
  embedding: number[];
}): CandidateDoc {
  return {
    chunkId: doc._id.toString(),
    documentId: doc.documentId.toString(),
    text: doc.text,
    page: doc.page,
    lineStart: doc.lineStart ?? undefined,
    lineEnd: doc.lineEnd ?? undefined,
    embedding: doc.embedding,
  };
}

async function fetchAtlasCandidates(
  queryText: string,
  queryEmbedding: number[],
  documentObjectIds: Types.ObjectId[],
  poolSize: number,
): Promise<CandidateDoc[]> {
  const [vectorHits, textHits] = await Promise.all([
    ChunkModel.aggregate([
      {
        $vectorSearch: {
          index: ATLAS_VECTOR_INDEX,
          path: 'embedding',
          queryVector: queryEmbedding,
          filter: { documentId: { $in: documentObjectIds } },
          numCandidates: poolSize * 4,
          limit: poolSize,
        },
      },
    ]),
    ChunkModel.aggregate([
      { $search: { index: ATLAS_TEXT_INDEX, text: { query: queryText, path: 'text' } } },
      { $match: { documentId: { $in: documentObjectIds } } },
      { $limit: poolSize },
    ]).catch(() => []),
  ]);

  const byId = new Map<string, CandidateDoc>();
  for (const doc of [...vectorHits, ...textHits]) {
    const candidate = toCandidate(doc);
    byId.set(candidate.chunkId, candidate);
  }
  return Array.from(byId.values());
}

async function fetchLocalCandidates(documentObjectIds: Types.ObjectId[]): Promise<CandidateDoc[]> {
  const docs = await ChunkModel.find({ documentId: { $in: documentObjectIds } }).lean();
  return docs.map((doc) => toCandidate(doc as never));
}

/**
 * Hybrid search: dense vector similarity + BM25 keyword scoring, merged with reciprocal rank
 * fusion, with a cosine-similarity floor applied afterward to reject irrelevant chunks before
 * they reach the generation prompt (hallucination mitigation).
 *
 * Uses native Atlas `$vectorSearch`/`$search` to gather the initial candidate pool when
 * available, otherwise scans the scoped chunks directly — either way, the actual scoring
 * (cosine + BM25) and fusion happens the same way in both cases, so behavior is consistent.
 */
export async function hybridSearch(options: HybridSearchOptions): Promise<RetrievedChunk[]> {
  const { queryText, queryEmbedding, documentIds, topK = 8, similarityThreshold = 0.7 } = options;
  if (documentIds.length === 0) return [];

  const documentObjectIds = documentIds.map((id) => new Types.ObjectId(id));
  const useAtlas = await detectAtlasSupport();

  const candidates = useAtlas
    ? await fetchAtlasCandidates(queryText, queryEmbedding, documentObjectIds, Math.max(30, topK * 4))
    : await fetchLocalCandidates(documentObjectIds);

  if (candidates.length === 0) return [];

  const cosineById = new Map<string, number>();
  const vectorRanked = candidates.map((c) => {
    const score = cosineSimilarity(queryEmbedding, c.embedding);
    cosineById.set(c.chunkId, score);
    return { id: c.chunkId, score };
  });

  const keywordRanked = bm25Score(
    queryText,
    candidates.map((c) => ({ id: c.chunkId, text: c.text })),
  );

  const fused = reciprocalRankFusion([vectorRanked, keywordRanked]);
  const byId = new Map(candidates.map((c) => [c.chunkId, c]));

  return fused
    .map((f) => {
      const candidate = byId.get(f.id) as CandidateDoc;
      return {
        chunkId: candidate.chunkId,
        documentId: candidate.documentId,
        text: candidate.text,
        page: candidate.page,
        lineStart: candidate.lineStart,
        lineEnd: candidate.lineEnd,
        score: f.score,
        cosineScore: cosineById.get(f.id) ?? 0,
      };
    })
    .filter((c) => c.cosineScore >= similarityThreshold)
    .slice(0, topK);
}

/** Test-only: reset the cached Atlas-support probe between test runs. */
export function _resetAtlasSupportCache(): void {
  atlasSupport = null;
}
