import Redis from 'ioredis';
import { env } from '../config/env';

export const redis = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });

/** BullMQ requires a separate connection for blocking subscriber operations. */
export const redisSubscriber = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });
