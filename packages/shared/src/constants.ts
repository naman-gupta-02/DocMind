/**
 * Placeholder owner id used until Phase 3 (auth/multi-tenancy) lands. All documents are
 * attributed to this single dev user so the ownerId field/schema is already in place.
 */
export const DEFAULT_OWNER_ID = 'dev-user';

export const SUPPORTED_EXTENSIONS = ['pdf', 'docx', 'txt', 'md'] as const;

export const MIME_TYPE_TO_EXT: Record<string, (typeof SUPPORTED_EXTENSIONS)[number]> = {
  'application/pdf': 'pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'text/plain': 'txt',
  'text/markdown': 'md',
};

/** Must match gemini-embedding-001's output size and infra/atlas/vector-index.json. */
export const EMBEDDING_DIMENSIONS = 3072;
export const ATLAS_VECTOR_INDEX = 'chunk_vector_index';
export const ATLAS_TEXT_INDEX = 'chunk_text_index';
