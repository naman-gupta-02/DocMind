import {
  ChatThreadModel,
  DocumentModel,
  MessageModel,
  createEmbeddingProvider,
  createLogger,
  hybridSearch,
  type Citation,
  type ChatThreadDoc,
} from '@docmind/shared';
import { env } from '../config/env';
import { createGenerationProvider, type GenerationTurn } from '../providers/generationProvider';
import { rerankChunks } from './rerank';

const logger = createLogger('chatService');
// Exported so tests can spy on/replace these methods directly rather than mocking the
// underlying HTTP client transitively through a compiled workspace dependency.
export const embeddingProvider = createEmbeddingProvider(env.EMBEDDING_PROVIDER, env.GEMINI_API_KEY);
export const generationProvider = createGenerationProvider(env.LLM_PROVIDER, {
  geminiApiKey: env.GEMINI_API_KEY,
  geminiModel: env.GEMINI_GENERATION_MODEL,
  ollamaBaseUrl: env.OLLAMA_BASE_URL,
  ollamaModel: env.OLLAMA_MODEL,
});

const HISTORY_TURNS = 6;

async function resolveThreadDocumentIds(thread: ChatThreadDoc): Promise<string[]> {
  if (thread.documentIds.length > 0) return thread.documentIds.map((id) => id.toString());
  const owned = await DocumentModel.find({ ownerId: thread.ownerId, status: 'completed' }, { _id: 1 }).lean();
  return owned.map((d) => d._id.toString());
}

/** Human-readable label for a thread's document scope — used in the UI and PDF export header. */
export async function resolveScopeLabel(documentIds: string[]): Promise<string> {
  if (documentIds.length === 0) return 'All documents';
  const docs = await DocumentModel.find({ _id: { $in: documentIds } }, { filename: 1 }).lean();
  return docs.map((d) => d.filename).join(', ') || 'All documents';
}

export interface AskQuestionOptions {
  threadId: string;
  ownerId: string;
  question: string;
  onToken: (token: string) => void;
}

export async function askQuestion(options: AskQuestionOptions) {
  const { threadId, ownerId, question, onToken } = options;

  const thread = await ChatThreadModel.findOne({ _id: threadId, ownerId });
  if (!thread) {
    throw new Error('Chat thread not found');
  }

  const existingMessageCount = await MessageModel.countDocuments({ threadId: thread._id });
  const userMessage = await MessageModel.create({ threadId: thread._id, role: 'user', content: question, citations: [] });

  if (existingMessageCount === 0) {
    thread.title = question.length > 60 ? `${question.slice(0, 57)}...` : question;
  }

  const documentIds = await resolveThreadDocumentIds(thread);
  const [queryEmbedding] = documentIds.length > 0 ? await embeddingProvider.embed([question]) : [[]];

  const retrieved =
    documentIds.length > 0
      ? await hybridSearch({
          queryText: question,
          queryEmbedding: queryEmbedding ?? [],
          documentIds,
          topK: env.RETRIEVAL_TOP_K * 3,
          similarityThreshold: env.SIMILARITY_THRESHOLD,
        })
      : [];

  const reranked = await rerankChunks(question, retrieved, {
    apiKey: env.GEMINI_API_KEY,
    modelName: env.GEMINI_RERANK_MODEL,
    enabled: env.RERANK_ENABLED,
    topN: env.RETRIEVAL_TOP_K,
    logger,
  });

  const referencedDocIds = Array.from(new Set(reranked.map((c) => c.documentId)));
  const docs = await DocumentModel.find({ _id: { $in: referencedDocIds } }, { filename: 1 }).lean();
  const filenameById = new Map(docs.map((d) => [d._id.toString(), d.filename]));

  const contextChunks = reranked.map((chunk, i) => ({
    index: i + 1,
    text: chunk.text,
    filename: filenameById.get(chunk.documentId) ?? 'document',
    page: chunk.page,
  }));

  const priorMessages = await MessageModel.find({ threadId: thread._id })
    .sort({ createdAt: -1 })
    .limit(HISTORY_TURNS + 1)
    .lean();
  const history: GenerationTurn[] = priorMessages
    .filter((m) => m._id.toString() !== userMessage._id.toString())
    .slice(0, HISTORY_TURNS)
    .reverse()
    .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }));

  const answer = await generationProvider.generate({
    question,
    context: contextChunks,
    history,
    onToken,
  });

  const citations: Citation[] = reranked.map((chunk, i) => ({
    chunkId: chunk.chunkId,
    documentId: chunk.documentId,
    filename: contextChunks[i]?.filename ?? 'document',
    page: chunk.page,
    snippet: chunk.text.slice(0, 240),
  }));

  const assistantMessage = await MessageModel.create({
    threadId: thread._id,
    role: 'assistant',
    content: answer,
    citations,
  });

  await thread.save();

  return { userMessage, assistantMessage };
}
