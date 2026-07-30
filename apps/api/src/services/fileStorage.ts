import { createHash } from 'node:crypto';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { env } from '../config/env';

export interface FileStorage {
  /** Persists a buffer and returns the storage path it was written to. */
  save(filename: string, buffer: Buffer): Promise<string>;
  delete(storagePath: string): Promise<void>;
}

// The API and worker run as separate processes (and, outside Docker, with different cwds), but
// the storagePath written to Mongo has to mean the same thing to both. Resolving against the
// repo root here — rather than leaving a relative UPLOAD_DIR to be resolved against whatever the
// current process's cwd happens to be — keeps that path unambiguous.
const REPO_ROOT = path.resolve(__dirname, '../../../..');

/**
 * Disk-backed storage. Swappable for an S3-backed implementation later behind the same
 * interface — the pipeline only depends on `FileStorage`, never on the filesystem directly.
 */
export class LocalFileStorage implements FileStorage {
  private readonly rootDir: string;

  constructor(rootDir: string = env.UPLOAD_DIR) {
    this.rootDir = path.isAbsolute(rootDir) ? rootDir : path.resolve(REPO_ROOT, rootDir);
  }

  async save(filename: string, buffer: Buffer): Promise<string> {
    await mkdir(this.rootDir, { recursive: true });
    const safeName = `${Date.now()}-${createHash('sha1').update(filename).digest('hex').slice(0, 8)}-${path.basename(filename)}`;
    const fullPath = path.join(this.rootDir, safeName);
    await writeFile(fullPath, buffer);
    return fullPath;
  }

  async delete(storagePath: string): Promise<void> {
    await rm(storagePath, { force: true });
  }
}

export function hashBuffer(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex');
}

export const fileStorage: FileStorage = new LocalFileStorage();
