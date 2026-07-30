import type { Redis } from 'ioredis';
import { DocumentModel, STAGE_PROGRESS, setJobStatus, type DocumentStatus } from '@docmind/shared';

export async function updateStage(
  redis: Redis,
  documentId: string,
  stage: DocumentStatus,
  message: string,
): Promise<void> {
  await DocumentModel.findByIdAndUpdate(documentId, { status: stage });
  await setJobStatus(redis, {
    documentId,
    stage,
    progress: STAGE_PROGRESS[stage],
    message,
    updatedAt: new Date().toISOString(),
  });
}

export async function markFailed(redis: Redis, documentId: string, errorMessage: string): Promise<void> {
  await DocumentModel.findByIdAndUpdate(documentId, { status: 'failed', errorMessage });
  await setJobStatus(redis, {
    documentId,
    stage: 'failed',
    progress: 100,
    message: errorMessage,
    updatedAt: new Date().toISOString(),
  });
}
