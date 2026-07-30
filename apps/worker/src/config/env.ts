import path from 'node:path';
import dotenv from 'dotenv';
import { z } from 'zod';

// Load the repo-root .env regardless of cwd — `npm run dev --workspace` runs with cwd set to
// this package's directory, not the repo root, so a bare `dotenv/config` would miss it.
dotenv.config({ path: path.resolve(__dirname, '../../../../.env') });

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  MONGODB_URI: z.string().min(1, 'MONGODB_URI is required'),
  REDIS_URL: z.string().min(1, 'REDIS_URL is required'),
  EMBEDDING_PROVIDER: z.enum(['gemini']).default('gemini'),
  GEMINI_API_KEY: z.string().optional().default(''),
  CHUNK_SIZE: z.coerce.number().default(1000),
  CHUNK_OVERLAP: z.coerce.number().default(150),
  JOB_STALE_TTL_MINUTES: z.coerce.number().default(15),
  RECONCILIATION_INTERVAL_MINUTES: z.coerce.number().default(5),
  WORKER_CONCURRENCY: z.coerce.number().default(2),
});

export type Env = z.infer<typeof envSchema>;

function loadEnv(): Env {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    // eslint-disable-next-line no-console
    console.error('Invalid environment configuration:', parsed.error.flatten().fieldErrors);
    process.exit(1);
  }
  return parsed.data;
}

export const env = loadEnv();
