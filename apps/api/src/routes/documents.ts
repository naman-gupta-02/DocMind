import { Router } from 'express';
import { customAlphabet } from 'nanoid';
import { z } from 'zod';
import { ChatThreadModel, DocumentModel, ChunkModel, ShareLinkModel, getJobStatus, type DocumentDoc } from '@docmind/shared';
import { requireAuth } from '../middleware/requireAuth';
import { upload } from '../middleware/upload';
import { ingestUpload } from '../services/documentService';
import { fileStorage } from '../services/fileStorage';
import { toDocumentRecord } from '../services/serializers';
import { redis } from '../redis/client';

// Mounted at /api/documents in app.ts — every route below is relative to that prefix, and this
// requireAuth applies only to requests that actually reach this router (i.e. ones already
// matching the /api/documents prefix), not to unrelated paths like /api/public/share/*.
export const documentsRouter = Router();
documentsRouter.use(requireAuth);

const generateShareToken = customAlphabet('abcdefghijklmnopqrstuvwxyz0123456789', 16);

documentsRouter.post('/', upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) {
      res.status(400).json({ error: 'No file uploaded. Use multipart field name "file".' });
      return;
    }
    const document = await ingestUpload(
      {
        originalname: req.file.originalname,
        mimetype: req.file.mimetype,
        buffer: req.file.buffer,
      },
      req.userId as string,
    );
    res.status(202).json({ document: toDocumentRecord(document) });
  } catch (err) {
    next(err);
  }
});

documentsRouter.get('/', async (req, res, next) => {
  try {
    const documents = await DocumentModel.find({ ownerId: req.userId }).sort({ createdAt: -1 }).lean();
    res.json({ documents: documents.map((d) => toDocumentRecord(d as unknown as DocumentDoc)) });
  } catch (err) {
    next(err);
  }
});

documentsRouter.get('/:id', async (req, res, next) => {
  try {
    const document = await DocumentModel.findOne({ _id: req.params.id, ownerId: req.userId }).lean();
    if (!document) {
      res.status(404).json({ error: 'Document not found' });
      return;
    }
    res.json({ document: toDocumentRecord(document as unknown as DocumentDoc) });
  } catch (err) {
    next(err);
  }
});

documentsRouter.get('/:id/status', async (req, res, next) => {
  try {
    const documentId = req.params.id;
    const document = await DocumentModel.findOne({ _id: documentId, ownerId: req.userId }).lean();
    if (!document) {
      res.status(404).json({ error: 'Document not found' });
      return;
    }

    const status = await getJobStatus(redis, documentId);
    if (status) {
      res.json({ status });
      return;
    }
    // Fall back to the persisted document status if the Redis hash already expired/was cleared.
    res.json({
      status: {
        documentId,
        stage: document.status,
        progress: document.status === 'completed' || document.status === 'failed' ? 100 : 0,
        message: document.errorMessage ?? document.status,
        updatedAt: (document as unknown as { updatedAt: Date }).updatedAt.toISOString(),
      },
    });
  } catch (err) {
    next(err);
  }
});

documentsRouter.delete('/:id', async (req, res, next) => {
  try {
    const document = await DocumentModel.findOne({ _id: req.params.id, ownerId: req.userId });
    if (!document) {
      res.status(404).json({ error: 'Document not found' });
      return;
    }
    await ChunkModel.deleteMany({ documentId: document._id });
    await fileStorage.delete(document.storagePath);
    await document.deleteOne();
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

const createShareSchema = z.object({
  threadId: z.string().optional(),
});

documentsRouter.post('/:id/share', async (req, res, next) => {
  try {
    const parsed = createShareSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.errors[0]?.message ?? 'Invalid input' });
      return;
    }

    const document = await DocumentModel.findOne({ _id: req.params.id, ownerId: req.userId });
    if (!document) {
      res.status(404).json({ error: 'Document not found' });
      return;
    }

    if (parsed.data.threadId) {
      const thread = await ChatThreadModel.findOne({ _id: parsed.data.threadId, ownerId: req.userId });
      if (!thread) {
        res.status(404).json({ error: 'Thread not found' });
        return;
      }
    }

    const share = await ShareLinkModel.create({
      ownerId: req.userId,
      documentId: document._id,
      threadId: parsed.data.threadId,
      token: generateShareToken(),
    });

    res.status(201).json({ token: share.token });
  } catch (err) {
    next(err);
  }
});
