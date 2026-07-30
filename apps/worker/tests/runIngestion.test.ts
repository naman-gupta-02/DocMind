import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { Redis } from 'ioredis';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { ChunkModel, DocumentModel, DEFAULT_OWNER_ID, type EmbeddingProvider } from '@docmind/shared';
import { runIngestion } from '../src/pipeline/runIngestion';

let mongod: MongoMemoryServer;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

function fakeRedis(): Redis {
  return {
    hset: vi.fn().mockResolvedValue(1),
    expire: vi.fn().mockResolvedValue(1),
    publish: vi.fn().mockResolvedValue(1),
  } as unknown as Redis;
}

const fakeEmbeddingProvider: EmbeddingProvider = {
  modelName: 'fake-model',
  async embed(texts) {
    return texts.map(() => [0.1, 0.2, 0.3]);
  },
};

describe('runIngestion', () => {
  it('parses, chunks, embeds, and indexes a text document end-to-end', async () => {
    const uploadDir = path.join(process.cwd(), 'data', 'worker-test-uploads');
    await mkdir(uploadDir, { recursive: true });
    const storagePath = path.join(uploadDir, `sample-${Date.now()}.txt`);
    const content = 'Sentence one. Sentence two. Sentence three. Sentence four. '.repeat(10);
    await writeFile(storagePath, content);

    const document = await DocumentModel.create({
      ownerId: DEFAULT_OWNER_ID,
      filename: 'sample.txt',
      mimeType: 'text/plain',
      ext: 'txt',
      sizeBytes: content.length,
      storagePath,
      fileHash: `test-hash-${Date.now()}`,
      status: 'queued',
    });

    await runIngestion(document._id.toString(), fakeRedis(), fakeEmbeddingProvider, {
      chunkSize: 100,
      chunkOverlap: 20,
    });

    const updated = await DocumentModel.findById(document._id).lean();
    expect(updated?.status).toBe('completed');
    expect(updated?.chunkCount).toBeGreaterThan(0);

    const chunks = await ChunkModel.find({ documentId: document._id }).lean();
    expect(chunks).toHaveLength(updated?.chunkCount ?? 0);
    for (const chunk of chunks) {
      expect(chunk.embedding).toEqual([0.1, 0.2, 0.3]);
      expect(chunk.embeddingModel).toBe('fake-model');
      expect(chunk.page).toBe(1);
    }
  });

  it('marks the document failed when the storage file is missing', async () => {
    const document = await DocumentModel.create({
      ownerId: DEFAULT_OWNER_ID,
      filename: 'missing.txt',
      mimeType: 'text/plain',
      ext: 'txt',
      sizeBytes: 10,
      storagePath: '/nonexistent/path/missing.txt',
      fileHash: `missing-hash-${Date.now()}`,
      status: 'queued',
    });

    await expect(
      runIngestion(document._id.toString(), fakeRedis(), fakeEmbeddingProvider, {
        chunkSize: 100,
        chunkOverlap: 20,
      }),
    ).rejects.toThrow();

    const updated = await DocumentModel.findById(document._id).lean();
    expect(updated?.status).toBe('failed');
    expect(updated?.errorMessage).toBeTruthy();
  });
});
