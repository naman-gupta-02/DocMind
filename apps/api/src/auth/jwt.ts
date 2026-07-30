import jwt from 'jsonwebtoken';
import { env } from '../config/env';

export interface AuthTokenPayload {
  userId: string;
  email: string;
}

const EXPIRES_IN = '7d';

export function signAuthToken(payload: AuthTokenPayload): string {
  return jwt.sign(payload, env.JWT_SECRET, { expiresIn: EXPIRES_IN });
}

export function verifyAuthToken(token: string): AuthTokenPayload {
  const decoded = jwt.verify(token, env.JWT_SECRET);
  if (typeof decoded !== 'object' || decoded === null || !('userId' in decoded) || !('email' in decoded)) {
    throw new Error('Invalid token payload');
  }
  return { userId: String((decoded as Record<string, unknown>).userId), email: String((decoded as Record<string, unknown>).email) };
}
