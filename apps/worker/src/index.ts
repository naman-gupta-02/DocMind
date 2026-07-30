import { Worker } from 'bullmq';
import Redis from 'ioredis';
import {
  INGESTION_QUEUE_NAME,
  connectMongo,
  createEmbeddingProvider,
  createLogger,
  type IngestionJobData,
} from '@docmind/shared';
import { env } from './config/env';
import { runIngestion } from './pipeline/runIngestion';

const logger = createLogger('worker');

async function main() {
  await connectMongo(env.MONGODB_URI);
  logger.info('Worker connected to MongoDB');

  const connection = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });
  const embeddingProvider = createEmbeddingProvider(env.EMBEDDING_PROVIDER, env.GEMINI_API_KEY);

  const worker = new Worker<IngestionJobData>(
    INGESTION_QUEUE_NAME,
    async (job) => {
      logger.info({ documentId: job.data.documentId }, 'Processing ingestion job');
      await runIngestion(job.data.documentId, connection, embeddingProvider, {
        chunkSize: env.CHUNK_SIZE,
        chunkOverlap: env.CHUNK_OVERLAP,
      });
    },
    { connection, concurrency: env.WORKER_CONCURRENCY },
  );

  worker.on('completed', (job) => {
    logger.info({ documentId: job.data.documentId }, 'Ingestion job completed');
  });

  worker.on('failed', (job, err) => {
    logger.error({ documentId: job?.data.documentId, err }, 'Ingestion job failed');
  });

  logger.info('DocMind worker started');
}

main().catch((err) => {
  logger.error({ err }, 'Failed to start worker');
  process.exit(1);
});
