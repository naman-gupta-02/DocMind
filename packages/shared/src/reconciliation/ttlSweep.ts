import { Queue } from 'bullmq';
import type { Redis } from 'ioredis';
import { ChunkModel } from '../db/models/chunk.model';
import { DocumentModel } from '../db/models/document.model';
import { clearJobStatus } from '../redis/jobStatus';
import { INGESTION_QUEUE_NAME } from '../types/job';
import { createLogger } from '../logger';

const logger = createLogger('reconciliation');

export interface ReconciliationConfig {
  connection: Redis;
  staleTtlMinutes: number;
}

/**
 * Finds documents stuck in a non-terminal status whose BullMQ job is no longer active or
 * waiting — the signature of a worker that crashed mid-job — and reconciles them: marks the
 * document failed, deletes any partially-written chunks, and clears its Redis status hash.
 */
export async function runReconciliationSweep(config: ReconciliationConfig): Promise<number> {
  const { connection, staleTtlMinutes } = config;
  const staleThreshold = new Date(Date.now() - staleTtlMinutes * 60 * 1000);
  const ingestionQueue = new Queue(INGESTION_QUEUE_NAME, { connection });
  let reconciledCount = 0;

  try {
    const staleDocuments = await DocumentModel.find({
      status: { $nin: ['completed', 'failed'] },
      updatedAt: { $lt: staleThreshold },
    });

    for (const doc of staleDocuments) {
      const documentId = doc._id.toString();
      const job = await ingestionQueue.getJob(documentId);
      const stillRunning = job ? (await job.isActive()) || (await job.isWaiting()) : false;

      if (stillRunning) continue;

      logger.warn({ documentId, status: doc.status }, 'Reconciling orphaned ingestion job');
      await ChunkModel.deleteMany({ documentId: doc._id });
      doc.status = 'failed';
      doc.errorMessage = 'Ingestion job orphaned (worker likely crashed) — reconciled by TTL sweep';
      await doc.save();
      await clearJobStatus(connection, documentId);
      reconciledCount++;
    }
  } finally {
    await ingestionQueue.close();
  }

  return reconciledCount;
}

export function startReconciliationSweep(
  connection: Redis,
  staleTtlMinutes: number,
  intervalMinutes: number,
): NodeJS.Timeout {
  const intervalMs = intervalMinutes * 60 * 1000;
  return setInterval(() => {
    runReconciliationSweep({ connection, staleTtlMinutes }).catch((err) => {
      logger.error({ err }, 'Reconciliation sweep failed');
    });
  }, intervalMs);
}
