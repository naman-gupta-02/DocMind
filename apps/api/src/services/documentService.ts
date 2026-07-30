import path from 'node:path';
import { ChunkModel, DocumentModel, MIME_TYPE_TO_EXT, type DocumentDoc } from '@docmind/shared';
import { ingestionQueue } from '../queues/ingestionQueue';
import { fileStorage, hashBuffer } from './fileStorage';

function resolveExt(originalname: string, mimeType: string): 'pdf' | 'docx' | 'txt' | 'md' {
  const byMime = MIME_TYPE_TO_EXT[mimeType];
  if (byMime) return byMime;
  const ext = path.extname(originalname).slice(1).toLowerCase();
  if (ext === 'pdf' || ext === 'docx' || ext === 'txt' || ext === 'md') return ext;
  throw new Error(`Unsupported file type for "${originalname}"`);
}

export interface UploadFileInput {
  originalname: string;
  mimetype: string;
  buffer: Buffer;
}

export async function ingestUpload(file: UploadFileInput, ownerId: string): Promise<DocumentDoc> {
  const ext = resolveExt(file.originalname, file.mimetype);
  const fileHash = hashBuffer(file.buffer);

  const duplicate = await DocumentModel.findOne({ ownerId, fileHash, status: 'completed' }).lean();

  if (duplicate) {
    const storagePath = await fileStorage.save(file.originalname, file.buffer);
    const created = await DocumentModel.create({
      ownerId,
      filename: file.originalname,
      mimeType: file.mimetype,
      ext,
      sizeBytes: file.buffer.length,
      storagePath,
      fileHash,
      status: 'completed',
      pageCount: duplicate.pageCount,
      chunkCount: duplicate.chunkCount,
    });

    const existingChunks = await ChunkModel.find({ documentId: duplicate._id }).lean();
    if (existingChunks.length > 0) {
      await ChunkModel.insertMany(
        existingChunks.map((chunk) => ({
          documentId: created._id,
          chunkIndex: chunk.chunkIndex,
          text: chunk.text,
          page: chunk.page,
          lineStart: chunk.lineStart,
          lineEnd: chunk.lineEnd,
          charStart: chunk.charStart,
          charEnd: chunk.charEnd,
          embedding: chunk.embedding,
          embeddingModel: chunk.embeddingModel,
        })),
      );
    }

    return created;
  }

  const storagePath = await fileStorage.save(file.originalname, file.buffer);
  const created = await DocumentModel.create({
    ownerId,
    filename: file.originalname,
    mimeType: file.mimetype,
    ext,
    sizeBytes: file.buffer.length,
    storagePath,
    fileHash,
    status: 'queued',
  });

  const documentId = created._id.toString();
  await ingestionQueue.add('ingest', { documentId }, { jobId: documentId });

  return created;
}
