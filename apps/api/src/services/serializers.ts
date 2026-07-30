import type { ChatThreadDoc, DocumentDoc, MessageDoc } from '@docmind/shared';
import type { ChatThreadRecord, DocumentRecord, MessageRecord } from '@docmind/shared';

export function toDocumentRecord(doc: DocumentDoc): DocumentRecord {
  return {
    id: doc._id.toString(),
    ownerId: doc.ownerId,
    filename: doc.filename,
    mimeType: doc.mimeType,
    ext: doc.ext as DocumentRecord['ext'],
    sizeBytes: doc.sizeBytes,
    storagePath: doc.storagePath,
    fileHash: doc.fileHash,
    status: doc.status as DocumentRecord['status'],
    errorMessage: doc.errorMessage ?? undefined,
    pageCount: doc.pageCount ?? undefined,
    chunkCount: doc.chunkCount ?? undefined,
    createdAt: (doc as unknown as { createdAt: Date }).createdAt.toISOString(),
    updatedAt: (doc as unknown as { updatedAt: Date }).updatedAt.toISOString(),
  };
}

export function toChatThreadRecord(thread: ChatThreadDoc): ChatThreadRecord {
  return {
    id: thread._id.toString(),
    ownerId: thread.ownerId,
    title: thread.title,
    documentIds: thread.documentIds.map((id) => id.toString()),
    createdAt: (thread as unknown as { createdAt: Date }).createdAt.toISOString(),
    updatedAt: (thread as unknown as { updatedAt: Date }).updatedAt.toISOString(),
  };
}

export function toMessageRecord(message: MessageDoc): MessageRecord {
  return {
    id: message._id.toString(),
    threadId: message.threadId.toString(),
    role: message.role as MessageRecord['role'],
    content: message.content,
    citations: message.citations.map((c) => ({
      chunkId: c.chunkId.toString(),
      documentId: c.documentId.toString(),
      filename: c.filename,
      page: c.page,
      snippet: c.snippet,
    })),
    createdAt: (message as unknown as { createdAt: Date }).createdAt.toISOString(),
  };
}
