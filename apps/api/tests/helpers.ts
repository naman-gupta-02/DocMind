import request from 'supertest';
import type { Express } from 'express';

let counter = 0;

export async function registerTestUser(app: Express): Promise<{ token: string; userId: string; email: string }> {
  counter += 1;
  const email = `test-user-${Date.now()}-${counter}@example.com`;
  const res = await request(app).post('/api/auth/register').send({ email, password: 'password123' });
  if (res.status !== 201) {
    throw new Error(`Failed to register test user: ${JSON.stringify(res.body)}`);
  }
  return { token: res.body.token as string, userId: res.body.user.id as string, email };
}
