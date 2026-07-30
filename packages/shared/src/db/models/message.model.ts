import mongoose, { Schema, model, type InferSchemaType, type Model } from 'mongoose';

const citationSchema = new Schema(
  {
    chunkId: { type: Schema.Types.ObjectId, required: true },
    documentId: { type: Schema.Types.ObjectId, required: true },
    filename: { type: String, required: true },
    page: { type: Number, required: true },
    snippet: { type: String, required: true },
  },
  { _id: false },
);

const messageSchema = new Schema(
  {
    threadId: { type: Schema.Types.ObjectId, required: true, ref: 'ChatThread', index: true },
    role: { type: String, required: true, enum: ['user', 'assistant'] },
    content: { type: String, required: true },
    citations: { type: [citationSchema], default: [] },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

messageSchema.index({ threadId: 1, createdAt: 1 });

export type MessageDoc = InferSchemaType<typeof messageSchema> & { _id: Schema.Types.ObjectId };

// Guard against OverwriteModelError when this module is loaded multiple times (e.g. hot reload).
export const MessageModel: Model<MessageDoc> =
  (mongoose.models.Message as Model<MessageDoc>) || model<MessageDoc>('Message', messageSchema);
