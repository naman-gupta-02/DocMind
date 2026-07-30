import { Router } from 'express';
import mongoose from 'mongoose';
import { redis } from '../redis/client';

export const healthRouter = Router();

healthRouter.get('/health', async (_req, res) => {
  const mongoUp = mongoose.connection.readyState === 1;
  let redisUp = false;
  try {
    redisUp = (await redis.ping()) === 'PONG';
  } catch {
    redisUp = false;
  }

  const healthy = mongoUp && redisUp;
  res.status(healthy ? 200 : 503).json({
    status: healthy ? 'ok' : 'degraded',
    mongo: mongoUp ? 'up' : 'down',
    redis: redisUp ? 'up' : 'down',
  });
});
