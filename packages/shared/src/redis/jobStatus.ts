import type { Redis } from 'ioredis';
import type { JobStatusPayload } from '../types/job';

export const JOB_PROGRESS_CHANNEL = 'job:progress';

export function jobStatusKey(documentId: string): string {
  return `job:status:${documentId}`;
}

/** TTL on the status hash so abandoned jobs don't accumulate in Redis forever. */
const STATUS_TTL_SECONDS = 60 * 60 * 24;

export async function setJobStatus(redis: Redis, payload: JobStatusPayload): Promise<void> {
  const key = jobStatusKey(payload.documentId);
  await redis.hset(key, {
    documentId: payload.documentId,
    stage: payload.stage,
    progress: String(payload.progress),
    message: payload.message,
    updatedAt: payload.updatedAt,
  });
  await redis.expire(key, STATUS_TTL_SECONDS);
  await redis.publish(JOB_PROGRESS_CHANNEL, JSON.stringify(payload));
}

export async function getJobStatus(redis: Redis, documentId: string): Promise<JobStatusPayload | null> {
  const raw = await redis.hgetall(jobStatusKey(documentId));
  if (!raw || Object.keys(raw).length === 0) return null;
  return {
    documentId: raw.documentId ?? documentId,
    stage: raw.stage as JobStatusPayload['stage'],
    progress: Number(raw.progress ?? 0),
    message: raw.message ?? '',
    updatedAt: raw.updatedAt ?? new Date().toISOString(),
  };
}

export async function clearJobStatus(redis: Redis, documentId: string): Promise<void> {
  await redis.del(jobStatusKey(documentId));
}
