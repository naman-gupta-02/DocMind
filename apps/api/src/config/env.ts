import path from 'node:path';
import dotenv from 'dotenv';
import { z } from 'zod';

// Load the repo-root .env regardless of cwd — `npm run dev --workspace` runs with cwd set to
// this package's directory, not the repo root, so a bare `dotenv/config` would miss it.
dotenv.config({ path: path.resolve(__dirname, '../../../../.env') });

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(4000),
  MONGODB_URI: z.string().min(1, 'MONGODB_URI is required'),
  REDIS_URL: z.string().min(1, 'REDIS_URL is required'),
  JWT_SECRET: z.string().default('changeme-in-production'),
  EMBEDDING_PROVIDER: z.enum(['gemini']).default('gemini'),
  LLM_PROVIDER: z.enum(['gemini', 'ollama']).default('gemini'),
  GEMINI_API_KEY: z.string().optional().default(''),
  GEMINI_GENERATION_MODEL: z.string().default('gemini-2.5-flash'),
  GEMINI_RERANK_MODEL: z.string().default('gemini-2.0-flash-lite'),
  OLLAMA_BASE_URL: z.string().default('http://localhost:11434'),
  OLLAMA_MODEL: z.string().default('llama3.2:latest'),
  RERANK_ENABLED: z
    .string()
    .optional()
    .default('true')
    .transform((v) => v === 'true'),
  RETRIEVAL_TOP_K: z.coerce.number().default(6),
  // 0.7 is the commonly-cited rule of thumb, but it's not universal — empirically,
  // gemini-embedding-001 scores genuinely relevant question/passage pairs around 0.55-0.70 and
  // clearly irrelevant ones around 0.45-0.50, so 0.7 rejects almost everything for this model.
  SIMILARITY_THRESHOLD: z.coerce.number().default(0.55),
  UPLOAD_DIR: z.string().default('./data/uploads'),
  MAX_UPLOAD_MB: z.coerce.number().default(25),
  CHUNK_SIZE: z.coerce.number().default(1000),
  CHUNK_OVERLAP: z.coerce.number().default(150),
  JOB_STALE_TTL_MINUTES: z.coerce.number().default(15),
  RECONCILIATION_INTERVAL_MINUTES: z.coerce.number().default(5),
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
