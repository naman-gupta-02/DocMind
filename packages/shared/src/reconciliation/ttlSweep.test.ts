import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import type { Redis } from 'ioredis';
import { DocumentModel } from '../db/models/document.model';
import { ChunkModel } from '../db/models/chunk.model';
import { DEFAULT_OWNER_ID } from '../constants';
import { runReconciliationSweep } from './ttlSweep';

vi.mock('bullmq', () => {
  return {
    Queue: class {
      async getJob() {
        return null; // Simulate a job that no longer exists (worker crashed, job lost).
      }
      async close() {
        return undefined;
      }
    },
  };
});

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
    del: vi.fn().mockResolvedValue(1),
  } as unknown as Redis;
}

describe('runReconciliationSweep', () => {
  it('marks stale, non-terminal documents as failed and deletes their partial chunks', async () => {
    const staleDoc = await DocumentModel.create({
      ownerId: DEFAULT_OWNER_ID,
      filename: 'stale.txt',
      mimeType: 'text/plain',
      ext: 'txt',
      sizeBytes: 10,
      storagePath: '/tmp/stale.txt',
      fileHash: `stale-${Date.now()}`,
      status: 'embedding',
    });
    // Backdate updatedAt past the staleness threshold (bypassing the timestamps plugin).
    await DocumentModel.collection.updateOne(
      { _id: staleDoc._id },
      { $set: { updatedAt: new Date(Date.now() - 60 * 60 * 1000) } },
    );
    await ChunkModel.create({
      documentId: staleDoc._id,
      chunkIndex: 0,
      text: 'partial chunk',
      page: 1,
      charStart: 0,
      charEnd: 10,
      embedding: [0.1],
      embeddingModel: 'test',
    });

    const freshDoc = await DocumentModel.create({
      ownerId: DEFAULT_OWNER_ID,
      filename: 'fresh.txt',
      mimeType: 'text/plain',
      ext: 'txt',
      sizeBytes: 10,
      storagePath: '/tmp/fresh.txt',
      fileHash: `fresh-${Date.now()}`,
      status: 'embedding',
    });

    const reconciledCount = await runReconciliationSweep({
      connection: fakeRedis(),
      staleTtlMinutes: 15,
    });

    expect(reconciledCount).toBe(1);

    const updatedStale = await DocumentModel.findById(staleDoc._id).lean();
    expect(updatedStale?.status).toBe('failed');
    expect(updatedStale?.errorMessage).toContain('orphaned');

    const remainingChunks = await ChunkModel.find({ documentId: staleDoc._id }).lean();
    expect(remainingChunks).toHaveLength(0);

    const updatedFresh = await DocumentModel.findById(freshDoc._id).lean();
    expect(updatedFresh?.status).toBe('embedding');
  });
});
