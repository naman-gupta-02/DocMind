export interface Citation {
  chunkId: string;
  documentId: string;
  filename: string;
  page: number;
  snippet: string;
}

export type MessageRole = 'user' | 'assistant';

export interface MessageRecord {
  id: string;
  threadId: string;
  role: MessageRole;
  content: string;
  citations: Citation[];
  createdAt: string;
}

export interface ChatThreadRecord {
  id: string;
  ownerId: string;
  title: string;
  documentIds: string[];
  createdAt: string;
  updatedAt: string;
}
