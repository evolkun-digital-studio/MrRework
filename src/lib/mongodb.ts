import mongoose from "mongoose";

const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  throw new Error("Missing MONGODB_URI. Copy .env.example to .env and set it.");
}

type Cached = { conn: typeof mongoose | null; promise: Promise<typeof mongoose> | null };
declare global {
  // eslint-disable-next-line no-var
  var _mongoose: Cached | undefined;
}
const cached: Cached = global._mongoose ?? { conn: null, promise: null };
global._mongoose = cached;

export async function dbConnect(): Promise<typeof mongoose> {
  if (cached.conn) return cached.conn;
  if (!cached.promise) {
    cached.promise = mongoose.connect(MONGODB_URI!, { bufferCommands: false });
  }
  try {
    cached.conn = await cached.promise;
  } catch (err) {
    // A failed connect() must not be cached — otherwise every future call
    // re-awaits the same rejected promise forever (until process restart),
    // even after the underlying issue (e.g. a transient Atlas disconnect)
    // has resolved itself.
    cached.promise = null;
    throw err;
  }
  return cached.conn;
}
