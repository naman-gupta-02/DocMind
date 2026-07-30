import { createServer } from 'node:http';
import Redis from 'ioredis';
import { connectMongo, createLogger, startReconciliationSweep } from '@docmind/shared';
import { createApp } from './app';
import { attachProgressSocket } from './sockets/progress';
import { attachChatSocket } from './sockets/chat';
import { env } from './config/env';

const logger = createLogger('api:server');

async function main() {
  await connectMongo(env.MONGODB_URI);
  logger.info('Connected to MongoDB');

  const app = createApp();
  const httpServer = createServer(app);
  const io = attachProgressSocket(httpServer);
  attachChatSocket(io);

  const reconciliationConnection = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });
  startReconciliationSweep(reconciliationConnection, env.JOB_STALE_TTL_MINUTES, env.RECONCILIATION_INTERVAL_MINUTES);
  logger.info('Reconciliation sweep started');

  httpServer.listen(env.PORT, () => {
    logger.info(`DocMind API listening on port ${env.PORT}`);
  });
}

main().catch((err) => {
  logger.error({ err }, 'Failed to start API server');
  process.exit(1);
});
