export type DocumentStatus =
  | 'queued'
  | 'parsing'
  | 'chunking'
  | 'embedding'
  | 'indexing'
  | 'completed'
  | 'failed';

export type SupportedExt = 'pdf' | 'docx' | 'txt' | 'md';

export interface DocumentRecord {
  id: string;
  ownerId: string;
  filename: string;
  mimeType: string;
  ext: SupportedExt;
  sizeBytes: number;
  storagePath: string;
  fileHash: string;
  status: DocumentStatus;
  errorMessage?: string;
  pageCount?: number;
  chunkCount?: number;
  createdAt: string;
  updatedAt: string;
}

export interface ChunkRecord {
  id: string;
  documentId: string;
  chunkIndex: number;
  text: string;
  page: number;
  lineStart?: number;
  lineEnd?: number;
  charStart: number;
  charEnd: number;
  embedding: number[];
  embeddingModel: string;
  createdAt: string;
}
