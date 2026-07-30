/**
 * Pure-compute micro-benchmarks — no network, no database, no external services. Measures the
 * CPU cost of the chunking splitter and the three pieces of hybrid search (cosine similarity,
 * BM25, reciprocal rank fusion) in isolation, so their cost can be reasoned about independently
 * of network/DB/LLM latency (see live-bench.ts for the end-to-end numbers).
 *
 * Run: npm run bench:micro
 */
import { bm25Score, cosineSimilarity, reciprocalRankFusion, splitText } from '@docmind/shared';

function percentile(sorted: number[], p: number): number {
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[idx] as number;
}

function timeMany(fn: () => void, iterations: number): { p50: number; p95: number; opsPerSec: number } {
  const samples: number[] = [];
  for (let i = 0; i < iterations; i++) {
    const start = process.hrtime.bigint();
    fn();
    const end = process.hrtime.bigint();
    samples.push(Number(end - start) / 1e6);
  }
  samples.sort((a, b) => a - b);
  const totalMs = samples.reduce((sum, s) => sum + s, 0);
  return {
    p50: percentile(samples, 50),
    p95: percentile(samples, 95),
    opsPerSec: 1000 / (totalMs / samples.length),
  };
}

function randomVector(dim: number): number[] {
  return Array.from({ length: dim }, () => Math.random() * 2 - 1);
}

function lorem(words: number): string {
  const vocab =
    'the quick brown fox jumps over lazy dog retrieval augmented generation combines vector search keyword matching language model chunking embedding index document pipeline citation similarity threshold reranking'.split(
      ' ',
    );
  return Array.from({ length: words }, () => vocab[Math.floor(Math.random() * vocab.length)]).join(' ');
}

console.log('DocMind micro-benchmarks (pure compute, single-threaded, no I/O)\n');

console.log('=== Chunking splitter (splitText) ===');
for (const sizeKb of [10, 100, 500, 1000]) {
  const sentence =
    'The quick brown fox jumps over the lazy dog while retrieval augmented generation systems parse and chunk long documents efficiently. ';
  const text = sentence.repeat(Math.ceil((sizeKb * 1024) / sentence.length));
  const start = process.hrtime.bigint();
  const chunks = splitText(text, { chunkSize: 1000, chunkOverlap: 150 });
  const ms = Number(process.hrtime.bigint() - start) / 1e6;
  const mbPerSec = text.length / 1024 / 1024 / (ms / 1000);
  console.log(
    `  ${String(sizeKb).padStart(4)} KB doc -> ${String(chunks.length).padStart(4)} chunks in ${ms.toFixed(2).padStart(8)} ms  (${mbPerSec.toFixed(1)} MB/s)`,
  );
}

console.log('\n=== Cosine similarity (3072-dim vectors, matching gemini-embedding-001) ===');
for (const iterations of [1000, 10000]) {
  const a = randomVector(3072);
  const b = randomVector(3072);
  const { p50, p95, opsPerSec } = timeMany(() => cosineSimilarity(a, b), iterations);
  console.log(
    `  ${String(iterations).padStart(6)} calls: p50 ${(p50 * 1000).toFixed(2)} µs, p95 ${(p95 * 1000).toFixed(2)} µs, ${opsPerSec.toFixed(0)} ops/sec`,
  );
}

console.log('\n=== BM25 scoring (50-word chunks) ===');
for (const corpusSize of [50, 200, 1000]) {
  const corpus = Array.from({ length: corpusSize }, (_, i) => ({ id: `chunk-${i}`, text: lorem(50) }));
  const query = 'retrieval augmented generation chunking embedding';
  const { p50, p95, opsPerSec } = timeMany(() => bm25Score(query, corpus), 20);
  console.log(
    `  corpus of ${String(corpusSize).padStart(4)}: p50 ${p50.toFixed(2)} ms, p95 ${p95.toFixed(2)} ms, ${opsPerSec.toFixed(1)} queries/sec`,
  );
}

console.log('\n=== Reciprocal rank fusion ===');
for (const n of [50, 200, 1000]) {
  const listA = Array.from({ length: n }, (_, i) => ({ id: `chunk-${i}`, score: Math.random() }));
  const listB = Array.from({ length: n }, (_, i) => ({ id: `chunk-${i}`, score: Math.random() }));
  const { p50, p95, opsPerSec } = timeMany(() => reciprocalRankFusion([listA, listB]), 200);
  console.log(
    `  ${String(n).padStart(4)} candidates/list: p50 ${p50.toFixed(3)} ms, p95 ${p95.toFixed(3)} ms, ${opsPerSec.toFixed(0)} fusions/sec`,
  );
}

console.log('\nDone.');
