import mongoose, { Schema, model, type InferSchemaType, type Model } from 'mongoose';

const userSchema = new Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    // Optional alternate login handle (e.g. "admin") — sparse so multiple users can omit it.
    username: { type: String, unique: true, sparse: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    name: { type: String },
  },
  { timestamps: true },
);

export type UserDoc = InferSchemaType<typeof userSchema> & { _id: Schema.Types.ObjectId };

// Guard against OverwriteModelError when this module is loaded multiple times (e.g. hot reload).
export const UserModel: Model<UserDoc> = (mongoose.models.User as Model<UserDoc>) || model<UserDoc>('User', userSchema);
