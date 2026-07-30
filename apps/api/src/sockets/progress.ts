import type { Server as HttpServer } from 'node:http';
import { Server as SocketIOServer } from 'socket.io';
import Redis from 'ioredis';
import { DocumentModel, JOB_PROGRESS_CHANNEL, type JobStatusPayload, createLogger } from '@docmind/shared';
import { env } from '../config/env';
import { attachSocketAuth } from './socketAuth';

const logger = createLogger('api:sockets');

export function attachProgressSocket(httpServer: HttpServer): SocketIOServer {
  const io = new SocketIOServer(httpServer, { cors: { origin: '*' } });
  attachSocketAuth(io);

  const subscriber = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });

  subscriber.subscribe(JOB_PROGRESS_CHANNEL, (err) => {
    if (err) logger.error({ err }, 'Failed to subscribe to job progress channel');
  });

  subscriber.on('message', (_channel, message) => {
    try {
      const payload = JSON.parse(message) as JobStatusPayload;
      io.to(`document:${payload.documentId}`).emit('job:progress', payload);
    } catch (err) {
      logger.error({ err }, 'Failed to parse job progress message');
    }
  });

  io.on('connection', (socket) => {
    socket.on('subscribe', async (documentId: string) => {
      if (typeof documentId !== 'string' || documentId.length === 0) return;
      const owned = await DocumentModel.exists({ _id: documentId, ownerId: socket.data.userId });
      if (owned) socket.join(`document:${documentId}`);
    });
    socket.on('unsubscribe', (documentId: string) => {
      if (typeof documentId === 'string') {
        socket.leave(`document:${documentId}`);
      }
    });
  });

  return io;
}
