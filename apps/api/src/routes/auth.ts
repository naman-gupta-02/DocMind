import { Router } from 'express';
import { z } from 'zod';
import { UserModel } from '@docmind/shared';
import { hashPassword, comparePassword } from '../auth/passwords';
import { signAuthToken, verifyAuthToken } from '../auth/jwt';

export const authRouter = Router();

const registerSchema = z.object({
  email: z.string().email(),
  username: z
    .string()
    .trim()
    .toLowerCase()
    .min(3, 'Username must be at least 3 characters')
    .regex(/^[a-z0-9_-]+$/i, 'Username can only contain letters, numbers, - and _')
    .optional(),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  name: z.string().min(1).optional(),
});

// Login accepts either an email or a username as "identifier" — password is only checked
// against the stored hash here, so it isn't re-validated for strength (that's a registration-time
// rule, not a login-time one).
const loginSchema = z.object({
  identifier: z.string().min(1, 'Email or username is required'),
  password: z.string().min(1, 'Password is required'),
});

function toUserRecord(user: { _id: unknown; email: string; username?: string | null; name?: string | null }) {
  return {
    id: String(user._id),
    email: user.email,
    username: user.username ?? undefined,
    name: user.name ?? undefined,
  };
}

authRouter.post('/register', async (req, res, next) => {
  try {
    const parsed = registerSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.errors[0]?.message ?? 'Invalid input' });
      return;
    }
    const { email, username, password, name } = parsed.data;

    const existing = await UserModel.findOne({
      $or: [{ email }, ...(username ? [{ username }] : [])],
    }).lean();
    if (existing) {
      res.status(409).json({ error: 'An account with that email or username already exists' });
      return;
    }

    const passwordHash = await hashPassword(password);
    const user = await UserModel.create({ email, username, passwordHash, name });
    const token = signAuthToken({ userId: user._id.toString(), email: user.email });

    res.status(201).json({ token, user: toUserRecord(user) });
  } catch (err) {
    next(err);
  }
});

authRouter.post('/login', async (req, res, next) => {
  try {
    // Accept the legacy `email` field name too so older clients keep working, but treat it as a
    // generic identifier that can match either `email` or `username`.
    const body = { identifier: req.body?.identifier ?? req.body?.email, password: req.body?.password };
    const parsed = loginSchema.safeParse(body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.errors[0]?.message ?? 'Invalid input' });
      return;
    }
    const { identifier, password } = parsed.data;
    const normalized = identifier.trim().toLowerCase();

    const user = await UserModel.findOne({ $or: [{ email: normalized }, { username: normalized }] });
    if (!user) {
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }

    const valid = await comparePassword(password, user.passwordHash);
    if (!valid) {
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }

    const token = signAuthToken({ userId: user._id.toString(), email: user.email });
    res.json({ token, user: toUserRecord(user) });
  } catch (err) {
    next(err);
  }
});

authRouter.get('/me', async (req, res) => {
  try {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
      res.status(401).json({ error: 'Missing or malformed Authorization header' });
      return;
    }
    const payload = verifyAuthToken(header.slice('Bearer '.length));
    const user = await UserModel.findById(payload.userId).lean();
    if (!user) {
      res.status(401).json({ error: 'User no longer exists' });
      return;
    }
    res.json({ user: toUserRecord(user) });
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
});
