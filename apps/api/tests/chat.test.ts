import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { ChunkModel, DocumentModel, MessageModel, _resetAtlasSupportCache } from '@docmind/shared';
import { createApp } from '../src/app';
import { ingestionQueue } from '../src/queues/ingestionQueue';
import { redis, redisSubscriber } from '../src/redis/client';
import { askQuestion, embeddingProvider, generationProvider } from '../src/services/chatService';
import { registerTestUser } from './helpers';

let mongod: MongoMemoryServer;

const QUESTION = 'What is the refund policy?';
const MATCHING_EMBEDDING = [0.6, 0.2, 0.0];
const FAKE_ANSWER = 'This is a test answer with a citation [1].';

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
  // Real embedding/generation calls are never exercised in tests: the query embedding is
  // pinned to match the seeded chunk's stored embedding exactly (cosine similarity 1.0), and
  // generation streams a fixed canned answer, split across two onToken calls like a real stream.
  vi.spyOn(embeddingProvider, 'embed').mockResolvedValue([MATCHING_EMBEDDING]);
  vi.spyOn(generationProvider, 'generate').mockImplementation(async ({ onToken }) => {
    onToken('This is a test answer');
    onToken(' with a citation [1].');
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

describe('POST /api/chat/threads', () => {
  it('rejects unauthenticated requests', async () => {
    const app = createApp();
    const res = await request(app).post('/api/chat/threads').send({});
    expect(res.status).toBe(401);
  });

  it('creates a thread scoped to a document', async () => {
    const app = createApp();
    const { token, userId } = await registerTestUser(app);
    const document = await seedCompletedDocumentWithChunk(userId);

    const res = await request(app)
      .post('/api/chat/threads')
      .set('Authorization', `Bearer ${token}`)
      .send({ documentIds: [document._id.toString()] });

    expect(res.status).toBe(201);
    expect(res.body.thread.documentIds).toEqual([document._id.toString()]);
  });
});

describe('askQuestion', () => {
  it('retrieves the matching chunk, streams a generated answer, and persists citations', async () => {
    const app = createApp();
    const { token, userId } = await registerTestUser(app);
    const document = await seedCompletedDocumentWithChunk(userId);

    const threadRes = await request(app)
      .post('/api/chat/threads')
      .set('Authorization', `Bearer ${token}`)
      .send({ documentIds: [document._id.toString()] });
    const threadId = threadRes.body.thread.id as string;

    let streamedText = '';
    const { userMessage, assistantMessage } = await askQuestion({
      threadId,
      ownerId: userId,
      question: QUESTION,
      onToken: (token) => {
        streamedText += token;
      },
    });

    expect(userMessage.role).toBe('user');
    expect(streamedText).toBe(FAKE_ANSWER);
    expect(assistantMessage.content).toBe(FAKE_ANSWER);
    expect(assistantMessage.citations).toHaveLength(1);
    expect(assistantMessage.citations[0]?.filename).toBe('refund-policy.txt');
    expect(assistantMessage.citations[0]?.documentId.toString()).toBe(document._id.toString());

    const persisted = await MessageModel.find({ threadId }).sort({ createdAt: 1 }).lean();
    expect(persisted).toHaveLength(2);
    expect(persisted[0]?.role).toBe('user');
    expect(persisted[1]?.role).toBe('assistant');
  });

  it('rejects a thread that does not belong to the requesting user', async () => {
    const app = createApp();
    const owner = await registerTestUser(app);
    const intruder = await registerTestUser(app);
    const document = await seedCompletedDocumentWithChunk(owner.userId);

    const threadRes = await request(app)
      .post('/api/chat/threads')
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ documentIds: [document._id.toString()] });

    await expect(
      askQuestion({
        threadId: threadRes.body.thread.id,
        ownerId: intruder.userId,
        question: QUESTION,
        onToken: () => undefined,
      }),
    ).rejects.toThrow('Chat thread not found');
  });
});

describe('GET /api/chat/threads/:id', () => {
  it('returns the thread with its messages in chronological order', async () => {
    const app = createApp();
    const { token, userId } = await registerTestUser(app);
    const document = await seedCompletedDocumentWithChunk(userId);

    const threadRes = await request(app)
      .post('/api/chat/threads')
      .set('Authorization', `Bearer ${token}`)
      .send({ documentIds: [document._id.toString()] });
    const threadId = threadRes.body.thread.id as string;

    await askQuestion({ threadId, ownerId: userId, question: QUESTION, onToken: () => undefined });

    const res = await request(app).get(`/api/chat/threads/${threadId}`).set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.messages).toHaveLength(2);
    expect(res.body.thread.title).toBe(QUESTION);
  });
});

describe('PATCH /api/chat/threads/:id', () => {
  it("updates an existing thread's document scope", async () => {
    const app = createApp();
    const { token, userId } = await registerTestUser(app);
    const documentA = await seedCompletedDocumentWithChunk(userId);
    const documentB = await seedCompletedDocumentWithChunk(userId);

    const threadRes = await request(app)
      .post('/api/chat/threads')
      .set('Authorization', `Bearer ${token}`)
      .send({ documentIds: [documentA._id.toString()] });
    const threadId = threadRes.body.thread.id as string;

    const res = await request(app)
      .patch(`/api/chat/threads/${threadId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ documentIds: [documentB._id.toString()] });

    expect(res.status).toBe(200);
    expect(res.body.thread.documentIds).toEqual([documentB._id.toString()]);
  });

  it('allows clearing the scope back to "all documents"', async () => {
    const app = createApp();
    const { token, userId } = await registerTestUser(app);
    const document = await seedCompletedDocumentWithChunk(userId);

    const threadRes = await request(app)
      .post('/api/chat/threads')
      .set('Authorization', `Bearer ${token}`)
      .send({ documentIds: [document._id.toString()] });
    const threadId = threadRes.body.thread.id as string;

    const res = await request(app)
      .patch(`/api/chat/threads/${threadId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ documentIds: [] });

    expect(res.status).toBe(200);
    expect(res.body.thread.documentIds).toEqual([]);
  });

  it("rejects scoping to a document the caller doesn't own", async () => {
    const app = createApp();
    const owner = await registerTestUser(app);
    const intruder = await registerTestUser(app);
    const ownerDoc = await seedCompletedDocumentWithChunk(owner.userId);
    const intruderDoc = await seedCompletedDocumentWithChunk(intruder.userId);

    const threadRes = await request(app)
      .post('/api/chat/threads')
      .set('Authorization', `Bearer ${intruder.token}`)
      .send({ documentIds: [intruderDoc._id.toString()] });
    const threadId = threadRes.body.thread.id as string;

    const res = await request(app)
      .patch(`/api/chat/threads/${threadId}`)
      .set('Authorization', `Bearer ${intruder.token}`)
      .send({ documentIds: [ownerDoc._id.toString()] });

    expect(res.status).toBe(400);
  });

  it("rejects updating another user's thread with 404", async () => {
    const app = createApp();
    const owner = await registerTestUser(app);
    const intruder = await registerTestUser(app);
    const document = await seedCompletedDocumentWithChunk(owner.userId);

    const threadRes = await request(app)
      .post('/api/chat/threads')
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ documentIds: [document._id.toString()] });
    const threadId = threadRes.body.thread.id as string;

    const res = await request(app)
      .patch(`/api/chat/threads/${threadId}`)
      .set('Authorization', `Bearer ${intruder.token}`)
      .send({ documentIds: [] });

    expect(res.status).toBe(404);
  });
});

describe('GET /api/chat/threads/:id/export.pdf', () => {
  it('streams a PDF export of the thread', async () => {
    const app = createApp();
    const { token, userId } = await registerTestUser(app);
    const document = await seedCompletedDocumentWithChunk(userId);

    const threadRes = await request(app)
      .post('/api/chat/threads')
      .set('Authorization', `Bearer ${token}`)
      .send({ documentIds: [document._id.toString()] });
    const threadId = threadRes.body.thread.id as string;

    await askQuestion({ threadId, ownerId: userId, question: QUESTION, onToken: () => undefined });

    const res = await request(app)
      .get(`/api/chat/threads/${threadId}/export.pdf`)
      .set('Authorization', `Bearer ${token}`)
      .buffer(true)
      .parse((response, callback) => {
        const chunks: Buffer[] = [];
        response.on('data', (chunk: Buffer) => chunks.push(chunk));
        response.on('end', () => callback(null, Buffer.concat(chunks)));
      });

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('application/pdf');
    expect((res.body as Buffer).subarray(0, 4).toString()).toBe('%PDF');
  });

  it('rejects PDF export for an unknown thread with 404', async () => {
    const app = createApp();
    const { token } = await registerTestUser(app);
    const res = await request(app)
      .get('/api/chat/threads/000000000000000000000000/export.pdf')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
  });
});
