import mongoose, { Schema, model, type InferSchemaType, type Model } from 'mongoose';

const chunkSchema = new Schema(
  {
    documentId: { type: Schema.Types.ObjectId, required: true, ref: 'Document', index: true },
    chunkIndex: { type: Number, required: true },
    text: { type: String, required: true },
    page: { type: Number, required: true },
    lineStart: { type: Number },
    lineEnd: { type: Number },
    charStart: { type: Number, required: true },
    charEnd: { type: Number, required: true },
    // Atlas Vector Search indexes this field — see infra/atlas/vector-index.json.
    embedding: { type: [Number], required: true },
    embeddingModel: { type: String, required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

chunkSchema.index({ documentId: 1, chunkIndex: 1 });

export type ChunkDoc = InferSchemaType<typeof chunkSchema> & { _id: Schema.Types.ObjectId };

// Guard against OverwriteModelError when this module is loaded multiple times (e.g. hot reload).
export const ChunkModel: Model<ChunkDoc> =
  (mongoose.models.Chunk as Model<ChunkDoc>) || model<ChunkDoc>('Chunk', chunkSchema);
