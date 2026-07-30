import { Router } from 'express';
import { DocumentModel, MessageModel, ShareLinkModel } from '@docmind/shared';
import { streamChatPdf } from '../services/pdfExport';
import { toMessageRecord } from '../services/serializers';

// Mounted at /api/public/share in app.ts, with no auth of any kind — this whole router must stay
// unauthenticated. It has its own dedicated mount prefix (rather than sharing /api with
// documentsRouter/chatRouter) specifically so an unrelated router's auth middleware can never
// intercept these requests — see the design-decisions note in the README about this bug.
export const publicShareRouter = Router();

publicShareRouter.get('/:token', async (req, res, next) => {
  try {
    const share = await ShareLinkModel.findOne({ token: req.params.token, revokedAt: { $exists: false } }).lean();
    if (!share) {
      res.status(404).json({ error: 'Share link not found or has been revoked' });
      return;
    }

    const document = await DocumentModel.findById(share.documentId).lean();
    if (!document) {
      res.status(404).json({ error: 'Shared document no longer exists' });
      return;
    }

    const documentSummary = {
      id: document._id.toString(),
      filename: document.filename,
      ext: document.ext,
      pageCount: document.pageCount,
      chunkCount: document.chunkCount,
      createdAt: (document as unknown as { createdAt: Date }).createdAt.toISOString(),
    };

    if (!share.threadId) {
      res.json({ document: documentSummary, messages: [] });
      return;
    }

    const messages = await MessageModel.find({ threadId: share.threadId }).sort({ createdAt: 1 }).lean();
    res.json({ document: documentSummary, messages: messages.map((m) => toMessageRecord(m as never)) });
  } catch (err) {
    next(err);
  }
});

publicShareRouter.get('/:token/export.pdf', async (req, res, next) => {
  try {
    const share = await ShareLinkModel.findOne({ token: req.params.token, revokedAt: { $exists: false } }).lean();
    if (!share) {
      res.status(404).json({ error: 'Share link not found or has been revoked' });
      return;
    }
    if (!share.threadId) {
      res.status(404).json({ error: 'No chat is attached to this share link' });
      return;
    }

    const document = await DocumentModel.findById(share.documentId).lean();
    if (!document) {
      res.status(404).json({ error: 'Shared document no longer exists' });
      return;
    }

    // Deliberately label the export with just the shared document's filename rather than the
    // thread's actual persisted document scope — that scope could include other documents the
    // owner has that an anonymous visitor to this link shouldn't learn about.
    const messages = await MessageModel.find({ threadId: share.threadId }).sort({ createdAt: 1 }).lean();

    streamChatPdf(res, {
      title: document.filename,
      scopeLabel: document.filename,
      messages: messages.map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
        citations: m.citations,
        createdAt: (m as unknown as { createdAt: Date }).createdAt,
      })),
    });
  } catch (err) {
    next(err);
  }
});
