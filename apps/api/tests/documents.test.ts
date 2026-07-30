import { createHash } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { ChunkModel, DocumentModel } from '@docmind/shared';
import { createApp } from '../src/app';
import { ingestionQueue } from '../src/queues/ingestionQueue';
import { redis, redisSubscriber } from '../src/redis/client';
import { ingestUpload } from '../src/services/documentService';
import { registerTestUser } from './helpers';

let mongod: MongoMemoryServer;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
  await ingestionQueue.close();
  redis.disconnect();
  redisSubscriber.disconnect();
});

describe('POST /api/documents', () => {
  it('rejects an unauthenticated upload with 401', async () => {
    const app = createApp();
    const res = await request(app)
      .post('/api/documents')
      .attach('file', Buffer.from('no auth'), { filename: 'sample.txt', contentType: 'text/plain' });
    expect(res.status).toBe(401);
  });

  it('accepts a supported upload, returns 202, and enqueues an ingestion job', async () => {
    const app = createApp();
    const { token } = await registerTestUser(app);

    const res = await request(app)
      .post('/api/documents')
      .set('Authorization', `Bearer ${token}`)
      .attach('file', Buffer.from('Hello DocMind, this is a test document.'), {
        filename: 'sample.txt',
        contentType: 'text/plain',
      });

    expect(res.status).toBe(202);
    expect(res.body.document.status).toBe('queued');
    expect(res.body.document.filename).toBe('sample.txt');

    const waitingCount = await ingestionQueue.getWaitingCount();
    expect(waitingCount).toBeGreaterThan(0);
  });

  it('rejects unsupported file types with 400', async () => {
    const app = createApp();
    const { token } = await registerTestUser(app);

    const res = await request(app)
      .post('/api/documents')
      .set('Authorization', `Bearer ${token}`)
      .attach('file', Buffer.from('not really an exe'), {
        filename: 'sample.exe',
        contentType: 'application/octet-stream',
      });

    expect(res.status).toBe(400);
  });

  it('rejects requests with no file attached', async () => {
    const app = createApp();
    const { token } = await registerTestUser(app);
    const res = await request(app).post('/api/documents').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(400);
  });
});

describe('GET /api/documents/:id/status', () => {
  it('returns the persisted document status when no live Redis job hash exists', async () => {
    const app = createApp();
    const { token } = await registerTestUser(app);

    const uploadRes = await request(app)
      .post('/api/documents')
      .set('Authorization', `Bearer ${token}`)
      .attach('file', Buffer.from('Status polling test content.'), {
        filename: 'status.txt',
        contentType: 'text/plain',
      });
    const documentId = uploadRes.body.document.id;

    const statusRes = await request(app).get(`/api/documents/${documentId}/status`).set('Authorization', `Bearer ${token}`);
    expect(statusRes.status).toBe(200);
    expect(statusRes.body.status.stage).toBe('queued');
  });

  it('returns 404 for an unknown document id', async () => {
    const app = createApp();
    const { token } = await registerTestUser(app);
    const res = await request(app)
      .get('/api/documents/000000000000000000000000/status')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
  });

  it("returns 404 for another user's document (multi-tenant isolation)", async () => {
    const app = createApp();
    const owner = await registerTestUser(app);
    const intruder = await registerTestUser(app);

    const uploadRes = await request(app)
      .post('/api/documents')
      .set('Authorization', `Bearer ${owner.token}`)
      .attach('file', Buffer.from('Owned by someone else.'), { filename: 'private.txt', contentType: 'text/plain' });
    const documentId = uploadRes.body.document.id;

    const res = await request(app)
      .get(`/api/documents/${documentId}`)
      .set('Authorization', `Bearer ${intruder.token}`);
    expect(res.status).toBe(404);
  });
});

describe('ingestUpload dedup', () => {
  it('short-circuits to completed and copies chunks when a completed document with the same hash exists', async () => {
    const app = createApp();
    const { userId } = await registerTestUser(app);

    const buffer = Buffer.from('Duplicate content for hashing.');
    const fileHash = createHash('sha256').update(buffer).digest('hex');

    const original = await DocumentModel.create({
      ownerId: userId,
      filename: 'orig.txt',
      mimeType: 'text/plain',
      ext: 'txt',
      sizeBytes: buffer.length,
      storagePath: '/tmp/orig.txt',
      fileHash,
      status: 'completed',
      pageCount: 1,
      chunkCount: 1,
    });

    await ChunkModel.create({
      documentId: original._id,
      chunkIndex: 0,
      text: 'Duplicate content for hashing.',
      page: 1,
      charStart: 0,
      charEnd: buffer.length,
      embedding: [0.1, 0.2, 0.3],
      embeddingModel: 'test-model',
    });

    const created = await ingestUpload({ originalname: 'copy.txt', mimetype: 'text/plain', buffer }, userId);

    expect(created.status).toBe('completed');
    expect(created.chunkCount).toBe(1);

    const copiedChunks = await ChunkModel.find({ documentId: created._id }).lean();
    expect(copiedChunks).toHaveLength(1);
    expect(copiedChunks[0]?.embedding).toEqual([0.1, 0.2, 0.3]);
  });
});
