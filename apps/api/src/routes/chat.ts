import { Router } from 'express';
import { z } from 'zod';
import { ChatThreadModel, DocumentModel, MessageModel, type ChatThreadDoc, type MessageDoc } from '@docmind/shared';
import { requireAuth } from '../middleware/requireAuth';
import { resolveScopeLabel } from '../services/chatService';
import { streamChatPdf } from '../services/pdfExport';
import { toChatThreadRecord, toMessageRecord } from '../services/serializers';

// Mounted at /api/chat in app.ts — every route below is relative to that prefix.
export const chatRouter = Router();
chatRouter.use(requireAuth);

const createThreadSchema = z.object({
  title: z.string().min(1).optional(),
  documentIds: z.array(z.string()).optional(),
});

const updateThreadSchema = z.object({
  documentIds: z.array(z.string()),
});

chatRouter.post('/threads', async (req, res, next) => {
  try {
    const parsed = createThreadSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.errors[0]?.message ?? 'Invalid input' });
      return;
    }
    const thread = await ChatThreadModel.create({
      ownerId: req.userId,
      title: parsed.data.title ?? 'New chat',
      documentIds: parsed.data.documentIds ?? [],
    });
    res.status(201).json({ thread: toChatThreadRecord(thread) });
  } catch (err) {
    next(err);
  }
});

chatRouter.get('/threads', async (req, res, next) => {
  try {
    const threads = await ChatThreadModel.find({ ownerId: req.userId }).sort({ updatedAt: -1 }).lean();
    res.json({ threads: threads.map((t) => toChatThreadRecord(t as unknown as ChatThreadDoc)) });
  } catch (err) {
    next(err);
  }
});

chatRouter.get('/threads/:id', async (req, res, next) => {
  try {
    const thread = await ChatThreadModel.findOne({ _id: req.params.id, ownerId: req.userId }).lean();
    if (!thread) {
      res.status(404).json({ error: 'Thread not found' });
      return;
    }
    const messages = await MessageModel.find({ threadId: thread._id }).sort({ createdAt: 1 }).lean();
    res.json({
      thread: toChatThreadRecord(thread as unknown as ChatThreadDoc),
      messages: messages.map((m) => toMessageRecord(m as unknown as MessageDoc)),
    });
  } catch (err) {
    next(err);
  }
});

// Lets a user change which documents an already-started thread references, not just at
// creation time — retrieval scope for the *next* question uses whatever is saved here.
chatRouter.patch('/threads/:id', async (req, res, next) => {
  try {
    const parsed = updateThreadSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.errors[0]?.message ?? 'Invalid input' });
      return;
    }

    if (parsed.data.documentIds.length > 0) {
      const ownedCount = await DocumentModel.countDocuments({
        _id: { $in: parsed.data.documentIds },
        ownerId: req.userId,
      });
      if (ownedCount !== parsed.data.documentIds.length) {
        res.status(400).json({ error: 'One or more documents are invalid' });
        return;
      }
    }

    const thread = await ChatThreadModel.findOneAndUpdate(
      { _id: req.params.id, ownerId: req.userId },
      { documentIds: parsed.data.documentIds },
      { new: true },
    );
    if (!thread) {
      res.status(404).json({ error: 'Thread not found' });
      return;
    }
    res.json({ thread: toChatThreadRecord(thread) });
  } catch (err) {
    next(err);
  }
});

chatRouter.delete('/threads/:id', async (req, res, next) => {
  try {
    const thread = await ChatThreadModel.findOne({ _id: req.params.id, ownerId: req.userId });
    if (!thread) {
      res.status(404).json({ error: 'Thread not found' });
      return;
    }
    await MessageModel.deleteMany({ threadId: thread._id });
    await thread.deleteOne();
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

chatRouter.get('/threads/:id/export.pdf', async (req, res, next) => {
  try {
    const thread = await ChatThreadModel.findOne({ _id: req.params.id, ownerId: req.userId }).lean();
    if (!thread) {
      res.status(404).json({ error: 'Thread not found' });
      return;
    }
    const messages = await MessageModel.find({ threadId: thread._id }).sort({ createdAt: 1 }).lean();
    const scopeLabel = await resolveScopeLabel(thread.documentIds.map((id) => id.toString()));

    streamChatPdf(res, {
      title: thread.title,
      scopeLabel,
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
