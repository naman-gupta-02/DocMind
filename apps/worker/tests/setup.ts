process.env.NODE_ENV = 'test';
process.env.MONGODB_URI = process.env.MONGODB_URI ?? 'mongodb://127.0.0.1:27017/docmind-worker-test-placeholder';
process.env.REDIS_URL = process.env.REDIS_URL ?? 'redis://127.0.0.1:6379';
