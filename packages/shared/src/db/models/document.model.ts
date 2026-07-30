import mongoose, { Schema, model, type InferSchemaType, type Model } from 'mongoose';

const documentSchema = new Schema(
  {
    ownerId: { type: String, required: true, index: true },
    filename: { type: String, required: true },
    mimeType: { type: String, required: true },
    ext: { type: String, required: true, enum: ['pdf', 'docx', 'txt', 'md'] },
    sizeBytes: { type: Number, required: true },
    storagePath: { type: String, required: true },
    fileHash: { type: String, required: true, index: true },
    status: {
      type: String,
      required: true,
      enum: ['queued', 'parsing', 'chunking', 'embedding', 'indexing', 'completed', 'failed'],
      default: 'queued',
      index: true,
    },
    errorMessage: { type: String },
    pageCount: { type: Number },
    chunkCount: { type: Number },
  },
  { timestamps: true },
);

documentSchema.index({ ownerId: 1, fileHash: 1 });

export type DocumentDoc = InferSchemaType<typeof documentSchema> & { _id: Schema.Types.ObjectId };

// Guard against OverwriteModelError when this module is loaded multiple times (e.g. hot reload).
export const DocumentModel: Model<DocumentDoc> =
  (mongoose.models.Document as Model<DocumentDoc>) || model<DocumentDoc>('Document', documentSchema);
