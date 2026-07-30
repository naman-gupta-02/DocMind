import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { createApp } from '../src/app';
import { ingestionQueue } from '../src/queues/ingestionQueue';
import { redis, redisSubscriber } from '../src/redis/client';

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

describe('POST /api/auth/register', () => {
  it('creates a new user and returns a token', async () => {
    const app = createApp();
    const res = await request(app).post('/api/auth/register').send({ email: 'alice@example.com', password: 'password123' });

    expect(res.status).toBe(201);
    expect(res.body.token).toBeTruthy();
    expect(res.body.user.email).toBe('alice@example.com');
  });

  it('rejects a duplicate email with 409', async () => {
    const app = createApp();
    await request(app).post('/api/auth/register').send({ email: 'bob@example.com', password: 'password123' });
    const res = await request(app).post('/api/auth/register').send({ email: 'bob@example.com', password: 'password123' });
    expect(res.status).toBe(409);
  });

  it('rejects a short password with 400', async () => {
    const app = createApp();
    const res = await request(app).post('/api/auth/register').send({ email: 'short@example.com', password: '123' });
    expect(res.status).toBe(400);
  });

  it('registers with an optional username and rejects a duplicate username with 409', async () => {
    const app = createApp();
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'frank@example.com', password: 'password123', username: 'frankly' });
    expect(res.status).toBe(201);
    expect(res.body.user.username).toBe('frankly');

    const dupe = await request(app)
      .post('/api/auth/register')
      .send({ email: 'someone-else@example.com', password: 'password123', username: 'frankly' });
    expect(dupe.status).toBe(409);
  });
});

describe('POST /api/auth/login', () => {
  it('logs in with correct credentials', async () => {
    const app = createApp();
    await request(app).post('/api/auth/register').send({ email: 'carol@example.com', password: 'password123' });

    const res = await request(app).post('/api/auth/login').send({ email: 'carol@example.com', password: 'password123' });
    expect(res.status).toBe(200);
    expect(res.body.token).toBeTruthy();
  });

  it('rejects an incorrect password with 401', async () => {
    const app = createApp();
    await request(app).post('/api/auth/register').send({ email: 'dave@example.com', password: 'password123' });

    const res = await request(app).post('/api/auth/login').send({ email: 'dave@example.com', password: 'wrongpassword' });
    expect(res.status).toBe(401);
  });

  it('rejects an unknown email with 401', async () => {
    const app = createApp();
    const res = await request(app).post('/api/auth/login').send({ email: 'nobody@example.com', password: 'password123' });
    expect(res.status).toBe(401);
  });

  it('logs in with a username instead of an email', async () => {
    const app = createApp();
    await request(app)
      .post('/api/auth/register')
      .send({ email: 'gina@example.com', password: 'password123', username: 'gina' });

    const res = await request(app).post('/api/auth/login').send({ identifier: 'gina', password: 'password123' });
    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe('gina@example.com');
  });

  it('does not enforce the registration password-length rule at login time', async () => {
    const app = createApp();
    await request(app)
      .post('/api/auth/register')
      .send({ email: 'hank@example.com', password: 'password123', username: 'hank' });

    // A short password should fail on the credentials check (401), not the schema (400).
    const res = await request(app).post('/api/auth/login').send({ identifier: 'hank', password: 'abc' });
    expect(res.status).toBe(401);
  });
});

describe('GET /api/auth/me', () => {
  it('returns the current user for a valid token', async () => {
    const app = createApp();
    const registerRes = await request(app)
      .post('/api/auth/register')
      .send({ email: 'erin@example.com', password: 'password123' });

    const res = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${registerRes.body.token}`);
    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe('erin@example.com');
  });

  it('rejects a missing token with 401', async () => {
    const app = createApp();
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
  });

  it('rejects a malformed token with 401', async () => {
    const app = createApp();
    const res = await request(app).get('/api/auth/me').set('Authorization', 'Bearer not-a-real-token');
    expect(res.status).toBe(401);
  });
});
