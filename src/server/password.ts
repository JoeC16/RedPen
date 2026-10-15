import { hash, verify } from "@node-rs/argon2";

// Argon2id with the library defaults (m=19456 KiB, t=2, p=1), which meet the
// OWASP password storage minimum.
export function hashPassword(password: string): Promise<string> {
  return hash(password);
}

export async function verifyPassword(passwordHash: string, password: string): Promise<boolean> {
  try {
    return await verify(passwordHash, password);
  } catch {
    return false;
  }
}

// Verified against when the email is unknown, so response time does not reveal
// which emails have accounts. Hash of a random string nobody knows.
export const DUMMY_HASH =
  "$argon2id$v=19$m=19456,t=2,p=1$4oV7LFBwpSjpDtrllSZdbA$0oKyrRy2lMvYFBvVVd/QT2ux4EeGRcyb6XpiICihFpQ";
