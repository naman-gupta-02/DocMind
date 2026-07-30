import { Queue } from 'bullmq';
import Redis from 'ioredis';
import { INGESTION_QUEUE_NAME, type IngestionJobData } from '@docmind/shared';
import { env } from '../config/env';

const queueConnection = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });

export const ingestionQueue = new Queue<IngestionJobData>(INGESTION_QUEUE_NAME, {
  connection: queueConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 5000 },
    removeOnComplete: { age: 60 * 60 * 24 },
    removeOnFail: { age: 60 * 60 * 24 * 7 },
  },
});
