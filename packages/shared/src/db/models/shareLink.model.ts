import mongoose, { Schema, model, type InferSchemaType, type Model } from 'mongoose';

const shareLinkSchema = new Schema(
  {
    ownerId: { type: String, required: true, index: true },
    documentId: { type: Schema.Types.ObjectId, required: true, ref: 'Document', index: true },
    threadId: { type: Schema.Types.ObjectId, ref: 'ChatThread' },
    token: { type: String, required: true, unique: true },
    revokedAt: { type: Date },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

export type ShareLinkDoc = InferSchemaType<typeof shareLinkSchema> & { _id: Schema.Types.ObjectId };

// Guard against OverwriteModelError when this module is loaded multiple times (e.g. hot reload).
export const ShareLinkModel: Model<ShareLinkDoc> =
  (mongoose.models.ShareLink as Model<ShareLinkDoc>) || model<ShareLinkDoc>('ShareLink', shareLinkSchema);
