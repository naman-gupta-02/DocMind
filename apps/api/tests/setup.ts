import { vi } from 'vitest';

process.env.NODE_ENV = 'test';
process.env.MONGODB_URI = process.env.MONGODB_URI ?? 'mongodb://127.0.0.1:27017/docmind-test-placeholder';
process.env.REDIS_URL = process.env.REDIS_URL ?? 'redis://127.0.0.1:6379';
process.env.UPLOAD_DIR = './data/test-uploads';
process.env.JWT_SECRET = 'test-secret';
process.env.GEMINI_API_KEY = 'test-key';

// Never hit the real Gemini API in tests. Provides deterministic embeddings, a canned streamed
// answer, and a canned rerank score list so chat/generation tests are fast and offline.
vi.mock('@google/generative-ai', () => {
  class FakeGenerativeModel {
    async batchEmbedContents(request: { requests: Array<{ content: { parts: Array<{ text: string }> } }> }) {
      return {
        embeddings: request.requests.map((r) => {
          const seed = r.content.parts[0]?.text.length ?? 1;
          return { values: [seed % 7, seed % 5, seed % 3].map((n) => n / 10) };
        }),
      };
    }

    startChat() {
      return {
        sendMessageStream: async () => ({
          stream: (async function* () {
            yield { text: () => 'This is a test answer' };
            yield { text: () => ' with a citation [1].' };
          })(),
        }),
      };
    }

    async generateContent() {
      return { response: { text: () => '[9, 3, 1, 0, 0]' } };
    }
  }

  class FakeGoogleGenerativeAI {
    getGenerativeModel() {
      return new FakeGenerativeModel();
    }
  }

  return { GoogleGenerativeAI: FakeGoogleGenerativeAI };
});
