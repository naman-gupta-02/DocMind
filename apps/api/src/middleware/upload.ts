import path from 'node:path';
import multer from 'multer';
import { SUPPORTED_EXTENSIONS } from '@docmind/shared';
import { env } from '../config/env';

function extOf(filename: string): string {
  return path.extname(filename).slice(1).toLowerCase();
}

export const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: env.MAX_UPLOAD_MB * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ext = extOf(file.originalname);
    if (!(SUPPORTED_EXTENSIONS as readonly string[]).includes(ext)) {
      cb(new Error(`Unsupported file type ".${ext}". Allowed: ${SUPPORTED_EXTENSIONS.join(', ')}`));
      return;
    }
    cb(null, true);
  },
});
