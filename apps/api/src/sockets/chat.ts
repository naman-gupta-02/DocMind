import type { Server as SocketIOServer } from 'socket.io';
import { createLogger } from '@docmind/shared';
import { askQuestion } from '../services/chatService';
import { toMessageRecord } from '../services/serializers';

const logger = createLogger('api:sockets:chat');

interface ChatSendPayload {
  threadId: string;
  message: string;
}

export function attachChatSocket(io: SocketIOServer): void {
  io.on('connection', (socket) => {
    socket.on('chat:send', async (payload: ChatSendPayload) => {
      const threadId = payload?.threadId;
      const message = payload?.message;

      if (typeof threadId !== 'string' || typeof message !== 'string' || message.trim().length === 0) {
        socket.emit('chat:error', { threadId, error: 'Invalid message payload' });
        return;
      }

      try {
        const { userMessage, assistantMessage } = await askQuestion({
          threadId,
          ownerId: socket.data.userId,
          question: message,
          onToken: (token) => {
            socket.emit('chat:token', { threadId, token });
          },
        });

        socket.emit('chat:done', {
          threadId,
          userMessage: toMessageRecord(userMessage),
          assistantMessage: toMessageRecord(assistantMessage),
        });
      } catch (err) {
        logger.error({ err, threadId }, 'chat:send failed');
        socket.emit('chat:error', {
          threadId,
          error: err instanceof Error ? err.message : 'Failed to generate a response',
        });
      }
    });
  });
}
