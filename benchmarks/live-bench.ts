/**
 * End-to-end benchmarks against a running local stack (API on :4000, worker, Mongo, Redis,
 * embedding + generation providers). Unlike micro-bench.ts, these numbers include real network,
 * database, and LLM-provider latency — they reflect this specific local dev environment, not a
 * production deployment (see the README's Benchmarks section for hardware/software details and
 * caveats).
 *
 * Prerequisites: API + worker running locally (npm run dev:api / dev:worker), reachable at
 * API_BASE_URL (default http://localhost:4000).
 *
 * Run: npm run bench:live
 */
import path from 'node:path';
import dotenv from 'dotenv';
import autocannon from 'autocannon';
import { io } from 'socket.io-client';
import mongoose, { Types } from 'mongoose';
import { ChunkModel, DocumentModel, hybridSearch } from '@docmind/shared';

dotenv.config({ path: path.resolve(__dirname, '.env') });
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const API_BASE_URL = process.env.BENCH_API_URL ?? 'http://localhost:4000';
const MONGODB_URI = process.env.MONGODB_URI ?? 'mongodb://127.0.0.1:27017/docmind';

function percentile(sorted: number[], p: number): number {
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[idx] as number;
}

function summarize(samples: number[]): { min: number; p50: number; p95: number; max: number; mean: number } {
  const sorted = [...samples].sort((a, b) => a - b);
  return {
    min: sorted[0] as number,
    p50: percentile(sorted, 50),
    p95: percentile(sorted, 95),
    max: sorted[sorted.length - 1] as number,
    mean: sorted.reduce((s, v) => s + v, 0) / sorted.length,
  };
}

function fmt(s: { min: number; p50: number; p95: number; max: number; mean: number }): string {
  return `min ${s.min.toFixed(0)}ms  mean ${s.mean.toFixed(0)}ms  p50 ${s.p50.toFixed(0)}ms  p95 ${s.p95.toFixed(0)}ms  max ${s.max.toFixed(0)}ms`;
}

async function registerBenchUser(): Promise<{ token: string; userId: string }> {
  const email = `bench-${Date.now()}@example.com`;
  const res = await fetch(`${API_BASE_URL}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: 'bench-password-123' }),
  });
  const data = (await res.json()) as { token: string; user: { id: string } };
  return { token: data.token, userId: data.user.id };
}

async function benchIngestion(token: string): Promise<string | null> {
  console.log('\n=== Ingestion latency (real upload -> parse -> chunk -> embed -> index) ===');
  const sentence =
    'Retrieval augmented generation combines a dense vector search step with keyword search, merged via reciprocal rank fusion, before handing the top passages to a language model. ';
  const sizesKb = [2, 20, 100];
  let lastCompletedDocId: string | null = null;

  for (const sizeKb of sizesKb) {
    const text = sentence.repeat(Math.ceil((sizeKb * 1024) / sentence.length));
    const form = new FormData();
    form.append('file', new Blob([text], { type: 'text/plain' }), `bench-${sizeKb}kb.txt`);

    const uploadStart = Date.now();
    const uploadRes = await fetch(`${API_BASE_URL}/api/documents`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    });
    const uploadJson = (await uploadRes.json()) as { document: { id: string } };
    const documentId = uploadJson.document.id;

    let lastStage = '';
    const stageTimestamps: Record<string, number> = { queued: uploadStart };
    const deadline = Date.now() + 60000;
    let finalStage = '';
    while (Date.now() < deadline) {
      const statusRes = await fetch(`${API_BASE_URL}/api/documents/${documentId}/status`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const statusJson = (await statusRes.json()) as { status: { stage: string } };
      const stage = statusJson.status.stage;
      if (stage !== lastStage) {
        stageTimestamps[stage] = Date.now();
        lastStage = stage;
      }
      if (stage === 'completed' || stage === 'failed') {
        finalStage = stage;
        break;
      }
      await new Promise((r) => setTimeout(r, 150));
    }

    const totalMs = Date.now() - uploadStart;
    if (finalStage === 'completed') {
      lastCompletedDocId = documentId;
      const stages = Object.keys(stageTimestamps);
      const breakdown = stages
        .slice(1)
        .map((stage, i) => `${stage} +${stageTimestamps[stage]! - stageTimestamps[stages[i]!]!}ms`)
        .join(', ');
      console.log(`  ${String(sizeKb).padStart(3)} KB file: ${totalMs}ms total (${breakdown})`);
    } else {
      console.log(`  ${String(sizeKb).padStart(3)} KB file: did not complete within 60s (last stage: ${lastStage})`);
    }
  }

  return lastCompletedDocId;
}

async function benchRetrieval(): Promise<void> {
  console.log('\n=== Hybrid search latency (local fallback path: fetch + cosine + BM25 + RRF) ===');
  await mongoose.connect(MONGODB_URI);

  const benchOwnerId = new Types.ObjectId().toString();
  const document = await DocumentModel.create({
    ownerId: benchOwnerId,
    filename: 'bench-synthetic.txt',
    mimeType: 'text/plain',
    ext: 'txt',
    sizeBytes: 1,
    storagePath: '/tmp/bench-synthetic.txt',
    fileHash: `bench-${Date.now()}`,
    status: 'completed',
  });

  try {
    for (const corpusSize of [50, 200, 1000]) {
      const chunks = Array.from({ length: corpusSize }, (_, i) => ({
        documentId: document._id,
        chunkIndex: i,
        text: `Synthetic benchmark chunk number ${i} discussing retrieval augmented generation, hybrid search, and reciprocal rank fusion in a document Q&A platform.`,
        page: 1,
        charStart: 0,
        charEnd: 100,
        embedding: Array.from({ length: 3072 }, () => Math.random() * 2 - 1),
        embeddingModel: 'bench-synthetic',
      }));
      await ChunkModel.insertMany(chunks);

      const queryEmbedding = Array.from({ length: 3072 }, () => Math.random() * 2 - 1);
      const samples: number[] = [];
      const runs = 20;
      for (let i = 0; i < runs; i++) {
        const start = process.hrtime.bigint();
        await hybridSearch({
          queryText: 'retrieval augmented generation hybrid search',
          queryEmbedding,
          documentIds: [document._id.toString()],
          topK: 8,
          similarityThreshold: 0, // synthetic random embeddings won't clear a real threshold — measuring latency, not relevance
        });
        samples.push(Number(process.hrtime.bigint() - start) / 1e6);
      }

      console.log(`  corpus of ${String(corpusSize).padStart(4)} chunks: ${fmt(summarize(samples))}  (n=${runs})`);
      await ChunkModel.deleteMany({ documentId: document._id });
    }
  } finally {
    await document.deleteOne();
    await mongoose.disconnect();
  }
}

async function benchChat(token: string, documentId: string | null): Promise<void> {
  console.log('\n=== Chat latency (real embedding + retrieval + generation, end to end) ===');
  if (!documentId) {
    console.log('  skipped — no completed document available from the ingestion benchmark');
    return;
  }

  const threadRes = await fetch(`${API_BASE_URL}/api/chat/threads`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ documentIds: [documentId] }),
  });
  const threadJson = (await threadRes.json()) as { thread: { id: string } };
  const threadId = threadJson.thread.id;

  const socket = io(API_BASE_URL, { path: '/socket.io', auth: { token } });
  await new Promise<void>((resolve, reject) => {
    socket.on('connect', () => resolve());
    socket.on('connect_error', reject);
  });

  const questions = [
    'What is this document about? Answer in one sentence.',
    'What does it say about chunking?',
    'Summarize the key point in a few words.',
  ];

  const firstTokenSamples: number[] = [];
  const totalSamples: number[] = [];

  for (const question of questions) {
    const start = Date.now();
    let firstTokenAt: number | null = null;

    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('chat response timed out')), 45000);

      socket.once('chat:token', () => {
        firstTokenAt = Date.now();
      });
      socket.once('chat:done', () => {
        clearTimeout(timeout);
        resolve();
      });
      socket.once('chat:error', (payload: { error: string }) => {
        clearTimeout(timeout);
        reject(new Error(payload.error));
      });
      socket.emit('chat:send', { threadId, message: question });
    });

    const end = Date.now();
    if (firstTokenAt) firstTokenSamples.push(firstTokenAt - start);
    totalSamples.push(end - start);
  }

  socket.disconnect();

  console.log(`  time to first token: ${fmt(summarize(firstTokenSamples))}  (n=${firstTokenSamples.length})`);
  console.log(`  time to full answer: ${fmt(summarize(totalSamples))}  (n=${totalSamples.length})`);
}

async function benchLoad(token: string): Promise<void> {
  console.log('\n=== HTTP load test (autocannon, 10 connections x 10s) ===');

  const healthResult = await autocannon({
    url: `${API_BASE_URL}/health`,
    connections: 10,
    duration: 10,
  });
  console.log(
    `  GET /health          : ${healthResult.requests.average.toFixed(0)} req/sec, p50 ${healthResult.latency.p50}ms, p99 ${healthResult.latency.p99}ms, ${healthResult.errors} errors`,
  );

  const docsResult = await autocannon({
    url: `${API_BASE_URL}/api/documents`,
    connections: 10,
    duration: 10,
    headers: { Authorization: `Bearer ${token}` },
  });
  console.log(
    `  GET /api/documents   : ${docsResult.requests.average.toFixed(0)} req/sec, p50 ${docsResult.latency.p50}ms, p99 ${docsResult.latency.p99}ms, ${docsResult.errors} errors`,
  );
}

async function main() {
  console.log('DocMind live benchmarks (against', API_BASE_URL, ')\n');
  console.log('Registering a throwaway benchmark user...');
  const { token } = await registerBenchUser();

  const documentId = await benchIngestion(token);
  await benchRetrieval();
  await benchChat(token, documentId);
  await benchLoad(token);

  console.log('\nDone. (Benchmark user + documents remain in the database; safe to delete.)');
  process.exit(0);
}

main().catch((err) => {
  console.error('Benchmark failed:', err);
  process.exit(1);
});
