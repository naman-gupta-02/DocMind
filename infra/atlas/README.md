# MongoDB Atlas setup

Vector Search and `$search` (BM25/full-text, used by Phase 2's hybrid retrieval) only run on a
real MongoDB Atlas cluster — they don't exist in a self-hosted/Dockerized `mongod`. Steps:

1. Create a free **M0** cluster at https://cloud.mongodb.com (M0 supports Vector Search).
2. Create a database named `docmind` with a `chunks` collection (the app will also create it
   automatically on first write if it doesn't exist).
3. Under **Atlas Search** for the `chunks` collection, create two indexes using the JSON
   definitions in this folder:
   - `vector-index.json` → a **Vector Search** index named `chunk_vector_index` on the
     `embedding` field (3072 dimensions, cosine similarity — matches Gemini's
     `gemini-embedding-001` output size).
   - `search-index.json` → a standard **Search** index named `chunk_text_index` for BM25/keyword
     search over the `text` field (used by Phase 2's hybrid retrieval).
4. Copy the cluster's connection string into `MONGODB_URI` in your `.env` file.

Index creation isn't scriptable through the MongoDB driver — it has to go through the Atlas UI,
`mongosh`, or the Atlas Admin API, which is why this is a manual one-time setup step rather than
something `docker-compose up` can do for you.
