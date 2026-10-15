import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

// AES-256-GCM for pupil display names. Format: v1.<iv>.<tag>.<ciphertext>, base64url parts.
// The key comes from PUPIL_NAME_KEY and never reaches the database.
const VERSION = "v1";

function keyBytes(keyB64: string): Buffer {
  const key = Buffer.from(keyB64, "base64");
  if (key.length !== 32) throw new Error("PUPIL_NAME_KEY must be 32 bytes, base64-encoded");
  return key;
}

export function encryptText(plain: string, keyB64: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", keyBytes(keyB64), iv);
  const ct = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, iv, tag, ct].map((p) => (typeof p === "string" ? p : p.toString("base64url"))).join(".");
}

export function decryptText(token: string, keyB64: string): string {
  const [version, iv, tag, ct] = token.split(".");
  if (version !== VERSION || !iv || !tag || ct === undefined) throw new Error("Unrecognised ciphertext");
  const decipher = createDecipheriv("aes-256-gcm", keyBytes(keyB64), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(ct, "base64url")), decipher.final()]).toString("utf8");
}

/** One-way key for rate-limit buckets, so raw emails and IPs are never stored. */
export function hashKey(value: string): string {
  return createHash("sha256").update(value.trim().toLowerCase()).digest("hex");
}
