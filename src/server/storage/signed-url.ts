import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Short-lived signed links to a photo. The link alone is not enough: the file
 * route also checks the session and that the viewer may see that pupil's work.
 * The signature stops a link copied out of the page being reused later.
 */
function secret(): Buffer {
  const base = process.env.FILE_URL_SECRET || process.env.AUTH_SECRET;
  if (!base) throw new Error("FILE_URL_SECRET or AUTH_SECRET must be set");
  return createHmac("sha256", base).update("redpen:file-urls").digest();
}

export const fileUrlTtlSeconds = () => Number(process.env.FILE_URL_TTL_SECONDS ?? 300);

function mac(fileId: string, userId: string, exp: number): string {
  return createHmac("sha256", secret()).update(`${fileId}.${userId}.${exp}`).digest("base64url");
}

/** A link for one user, valid for a few minutes. */
export function signedFileUrl(fileId: string, userId: string, now = Date.now()): string {
  const exp = Math.floor(now / 1000) + fileUrlTtlSeconds();
  return `/api/files/${fileId}?e=${exp}&s=${mac(fileId, userId, exp)}`;
}

export function verifyFileUrl(fileId: string, userId: string, e: string | null, s: string | null, now = Date.now()): boolean {
  const exp = Number(e);
  if (!s || !Number.isInteger(exp) || exp < Math.floor(now / 1000)) return false;
  const expected = Buffer.from(mac(fileId, userId, exp));
  const given = Buffer.from(s);
  return expected.length === given.length && timingSafeEqual(expected, given);
}
