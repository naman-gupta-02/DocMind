import mongoose, { Schema, model, type InferSchemaType, type Model } from 'mongoose';

const chatThreadSchema = new Schema(
  {
    ownerId: { type: String, required: true, index: true },
    title: { type: String, required: true, default: 'New chat' },
    // Empty array = scoped across all of the owner's documents ("collection" chat).
    documentIds: { type: [Schema.Types.ObjectId], default: [], ref: 'Document' },
  },
  { timestamps: true },
);

export type ChatThreadDoc = InferSchemaType<typeof chatThreadSchema> & { _id: Schema.Types.ObjectId };

// Guard against OverwriteModelError when this module is loaded multiple times (e.g. hot reload).
export const ChatThreadModel: Model<ChatThreadDoc> =
  (mongoose.models.ChatThread as Model<ChatThreadDoc>) || model<ChatThreadDoc>('ChatThread', chatThreadSchema);
