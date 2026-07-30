import type { ErrorRequestHandler } from 'express';
import { MulterError } from 'multer';
import { createLogger } from '@docmind/shared';

const logger = createLogger('api:errors');

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof MulterError) {
    res.status(400).json({ error: err.message });
    return;
  }
  if (err instanceof Error) {
    logger.error({ err }, 'Unhandled request error');
    res.status(400).json({ error: err.message });
    return;
  }
  logger.error({ err }, 'Unhandled non-Error thrown');
  res.status(500).json({ error: 'Internal server error' });
};
