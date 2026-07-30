import cors from 'cors';
import express, { type Express } from 'express';
import helmet from 'helmet';
import { authRouter } from './routes/auth';
import { chatRouter } from './routes/chat';
import { documentsRouter } from './routes/documents';
import { healthRouter } from './routes/health';
import { publicShareRouter } from './routes/publicShare';
import { errorHandler } from './middleware/errorHandler';

export function createApp(): Express {
  const app = express();

  app.use(helmet());
  app.use(cors());
  app.use(express.json());

  app.use(healthRouter);

  // Each router gets its own dedicated mount prefix rather than sharing a generic '/api' — that
  // way an auth-gated router's blanket middleware can never intercept an unrelated router's
  // (e.g. the public share endpoints') requests just because they both live under '/api'.
  app.use('/api/auth', authRouter);
  app.use('/api/documents', documentsRouter);
  app.use('/api/chat', chatRouter);
  app.use('/api/public/share', publicShareRouter);

  app.use(errorHandler);

  return app;
}
