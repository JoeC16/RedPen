import { LocalStorage } from "./local";
import { S3Storage } from "./s3";

/**
 * Private object storage for pupil photos. Production uses an S3-compatible
 * bucket in a UK or EU region; development and tests can use a local folder.
 * Nothing is ever served straight from the store: the app streams files to
 * signed-in users with access, through short-lived signed URLs.
 */
export interface ObjectStorage {
  put(key: string, bytes: Buffer, contentType: string): Promise<void>;
  get(key: string): Promise<Buffer>;
  delete(key: string): Promise<void>;
}

let store: ObjectStorage | undefined;

export function storage(): ObjectStorage {
  if (store) return store;
  const driver = process.env.STORAGE_DRIVER ?? "local";
  if (driver === "s3") {
    const need = (k: string) => {
      const v = process.env[k];
      if (!v) throw new Error(`${k} must be set when STORAGE_DRIVER=s3 (see .env.example)`);
      return v;
    };
    store = new S3Storage({
      bucket: need("S3_BUCKET"),
      region: need("S3_REGION"),
      endpoint: process.env.S3_ENDPOINT || undefined,
      forcePathStyle: process.env.S3_FORCE_PATH_STYLE === "true",
      accessKeyId: need("S3_ACCESS_KEY_ID"),
      secretAccessKey: need("S3_SECRET_ACCESS_KEY"),
    });
  } else if (driver === "local") {
    store = new LocalStorage(process.env.STORAGE_LOCAL_DIR ?? ".storage");
  } else {
    throw new Error(`Unknown STORAGE_DRIVER "${driver}"`);
  }
  return store;
}

/** Tests only. */
export function setStorageForTests(s: ObjectStorage | undefined) {
  store = s;
}
