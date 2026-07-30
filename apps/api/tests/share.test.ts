import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { ChunkModel, DocumentModel, _resetAtlasSupportCache } from '@docmind/shared';
import { createApp } from '../src/app';
import { ingestionQueue } from '../src/queues/ingestionQueue';
import { redis, redisSubscriber } from '../src/redis/client';
import { askQuestion, embeddingProvider, generationProvider } from '../src/services/chatService';
import { registerTestUser } from './helpers';

let mongod: MongoMemoryServer;

const QUESTION = 'What is the refund policy?';
const MATCHING_EMBEDDING = [0.6, 0.2, 0.0];
const FAKE_ANSWER = 'Refunds are honored within 30 days [1].';

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
  _resetAtlasSupportCache();
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
  await ingestionQueue.close();
  redis.disconnect();
  redisSubscriber.disconnect();
});

beforeEach(() => {
  vi.spyOn(embeddingProvider, 'embed').mockResolvedValue([MATCHING_EMBEDDING]);
  vi.spyOn(generationProvider, 'generate').mockImplementation(async ({ onToken }) => {
    onToken(FAKE_ANSWER);
    return FAKE_ANSWER;
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

async function seedCompletedDocumentWithChunk(ownerId: string) {
  const document = await DocumentModel.create({
    ownerId,
    filename: 'refund-policy.txt',
    mimeType: 'text/plain',
    ext: 'txt',
    sizeBytes: 100,
    storagePath: '/tmp/refund-policy.txt',
    fileHash: `hash-${Date.now()}-${Math.random()}`,
    status: 'completed',
    pageCount: 1,
    chunkCount: 1,
  });

  await ChunkModel.create({
    documentId: document._id,
    chunkIndex: 0,
    text: 'Refunds are available within 30 days of purchase with a valid receipt.',
    page: 1,
    charStart: 0,
    charEnd: 70,
    embedding: MATCHING_EMBEDDING,
    embeddingModel: 'test-model',
  });

  return document;
}

async function bufferResponse(req: request.Test) {
  return req.buffer(true).parse((response, callback) => {
    const chunks: Buffer[] = [];
    response.on('data', (chunk: Buffer) => chunks.push(chunk));
    response.on('end', () => callback(null, Buffer.concat(chunks)));
  });
}

describe('POST /api/documents/:id/share', () => {
  it('creates a share link for an owned document', async () => {
    const app = createApp();
    const { token, userId } = await registerTestUser(app);
    const document = await seedCompletedDocumentWithChunk(userId);

    const res = await request(app)
      .post(`/api/documents/${document._id}/share`)
      .set('Authorization', `Bearer ${token}`)
      .send({});

    expect(res.status).toBe(201);
    expect(res.body.token).toBeTruthy();
  });

  it("rejects sharing another user's document with 404", async () => {
    const app = createApp();
    const owner = await registerTestUser(app);
    const intruder = await registerTestUser(app);
    const document = await seedCompletedDocumentWithChunk(owner.userId);

    const res = await request(app)
      .post(`/api/documents/${document._id}/share`)
      .set('Authorization', `Bearer ${intruder.token}`)
      .send({});

    expect(res.status).toBe(404);
  });
});

describe('GET /api/public/share/:token', () => {
  it('returns document metadata and chat messages without authentication', async () => {
    const app = createApp();
    const { token, userId } = await registerTestUser(app);
    const document = await seedCompletedDocumentWithChunk(userId);

    const threadRes = await request(app)
      .post('/api/chat/threads')
      .set('Authorization', `Bearer ${token}`)
      .send({ documentIds: [document._id.toString()] });
    const threadId = threadRes.body.thread.id as string;
    await askQuestion({ threadId, ownerId: userId, question: QUESTION, onToken: () => undefined });

    const shareRes = await request(app)
      .post(`/api/documents/${document._id}/share`)
      .set('Authorization', `Bearer ${token}`)
      .send({ threadId });
    const shareToken = shareRes.body.token as string;

    const res = await request(app).get(`/api/public/share/${shareToken}`);
    expect(res.status).toBe(200);
    expect(res.body.document.filename).toBe('refund-policy.txt');
    expect(res.body.messages).toHaveLength(2);
  });

  it('returns 404 for an unknown token', async () => {
    const app = createApp();
    const res = await request(app).get('/api/public/share/does-not-exist');
    expect(res.status).toBe(404);
  });
});

describe('GET /api/public/share/:token/export.pdf', () => {
  it('streams a PDF export of the shared chat without authentication', async () => {
    const app = createApp();
    const { token, userId } = await registerTestUser(app);
    const document = await seedCompletedDocumentWithChunk(userId);

    const threadRes = await request(app)
      .post('/api/chat/threads')
      .set('Authorization', `Bearer ${token}`)
      .send({ documentIds: [document._id.toString()] });
    const threadId = threadRes.body.thread.id as string;
    await askQuestion({ threadId, ownerId: userId, question: QUESTION, onToken: () => undefined });

    const shareRes = await request(app)
      .post(`/api/documents/${document._id}/share`)
      .set('Authorization', `Bearer ${token}`)
      .send({ threadId });
    const shareToken = shareRes.body.token as string;

    const res = await bufferResponse(request(app).get(`/api/public/share/${shareToken}/export.pdf`));

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('application/pdf');
    expect((res.body as Buffer).subarray(0, 4).toString()).toBe('%PDF');
  });

  it('returns 404 when the share link has no chat attached', async () => {
    const app = createApp();
    const { token, userId } = await registerTestUser(app);
    const document = await seedCompletedDocumentWithChunk(userId);

    const shareRes = await request(app)
      .post(`/api/documents/${document._id}/share`)
      .set('Authorization', `Bearer ${token}`)
      .send({});
    const shareToken = shareRes.body.token as string;

    const res = await request(app).get(`/api/public/share/${shareToken}/export.pdf`);
    expect(res.status).toBe(404);
  });
});
