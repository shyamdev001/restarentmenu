import mongoose from 'mongoose';
import { env } from './env.js';

export async function connectDb(uri = env.mongoUri) {
  mongoose.set('strictQuery', true);
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 8000 });
  console.log(`MongoDB connected: ${mongoose.connection.name}`);
}

/** Shared schema options: expose `id`, hide `_id` and `__v` in JSON. */
export const jsonOptions = {
  timestamps: true,
  toJSON: {
    virtuals: true,
    versionKey: false,
    transform(_doc, ret) {
      ret.id = String(ret._id);
      delete ret._id;
    }
  }
};
