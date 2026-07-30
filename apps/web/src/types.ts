// Deliberately not imported from @docmind/shared: that package pulls in server-only
// dependencies (mongoose, bullmq, ioredis) that shouldn't end up in the browser bundle.
export type DocumentStatus = 'queued' | 'parsing' | 'chunking' | 'embedding' | 'indexing' | 'completed' | 'failed';

export interface DocumentRecord {
  id: string;
  filename: string;
  mimeType: string;
  ext: string;
  sizeBytes: number;
  fileHash: string;
  status: DocumentStatus;
  errorMessage?: string;
  pageCount?: number;
  chunkCount?: number;
  createdAt: string;
  updatedAt: string;
}

export const PIPELINE_STAGES = ['queued', 'parsing', 'chunking', 'embedding', 'indexing', 'completed'] as const;

export const STAGE_LABELS: Record<DocumentStatus, string> = {
  queued: 'Queued',
  parsing: 'Parsing',
  chunking: 'Chunking',
  embedding: 'Embedding',
  indexing: 'Indexing',
  completed: 'Completed',
  failed: 'Failed',
};

export interface JobStatusPayload {
  documentId: string;
  stage: DocumentStatus;
  progress: number;
  message: string;
  updatedAt: string;
}

export interface User {
  id: string;
  email: string;
  username?: string;
  name?: string;
}

export interface Citation {
  chunkId: string;
  documentId: string;
  filename: string;
  page: number;
  snippet: string;
}

export type MessageRole = 'user' | 'assistant';

export interface MessageRecord {
  id: string;
  threadId: string;
  role: MessageRole;
  content: string;
  citations: Citation[];
  createdAt: string;
}

export interface ChatThreadRecord {
  id: string;
  ownerId: string;
  title: string;
  documentIds: string[];
  createdAt: string;
  updatedAt: string;
}
