import type { DocumentStatus } from './document';

export interface JobStatusPayload {
  documentId: string;
  stage: DocumentStatus;
  progress: number;
  message: string;
  updatedAt: string;
}

export const INGESTION_QUEUE_NAME = 'ingestion';

export interface IngestionJobData {
  documentId: string;
}

/** Stage weights used to compute an overall 0-100 progress percentage. */
export const STAGE_PROGRESS: Record<DocumentStatus, number> = {
  queued: 0,
  parsing: 20,
  chunking: 40,
  embedding: 70,
  indexing: 90,
  completed: 100,
  failed: 100,
};
