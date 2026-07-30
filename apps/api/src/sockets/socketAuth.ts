import type { Server as SocketIOServer, Socket } from 'socket.io';
import { verifyAuthToken } from '../auth/jwt';

export function attachSocketAuth(io: SocketIOServer): void {
  io.use((socket: Socket, next) => {
    const token = socket.handshake.auth?.token as string | undefined;
    if (!token) {
      next(new Error('Missing auth token'));
      return;
    }
    try {
      const payload = verifyAuthToken(token);
      socket.data.userId = payload.userId;
      next();
    } catch {
      next(new Error('Invalid or expired auth token'));
    }
  });
}
