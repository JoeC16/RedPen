import { sql } from "drizzle-orm";
import { z } from "zod";
import { recordAuthEvent } from "../audit";
import { hashKey } from "../crypto";
import { db } from "../db/client";
import { DUMMY_HASH, verifyPassword } from "../password";
import { isRateLimited, limitsFromEnv, recentFailures, recordAttempt } from "./rate-limit";

export const credentialsSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  password: z.string().min(1).max(256),
});

export type LoginResult =
  | { ok: true; userId: string; email: string }
  | { ok: false; reason: "invalid" | "rate_limited" };

type AuthRow = { id: string; password_hash: string | null; disabled_at: Date | null };

/**
 * Check credentials with rate limiting and audit logging. Unknown email, wrong
 * password and disabled account all return "invalid" so accounts cannot be
 * enumerated.
 */
export async function attemptLogin(input: unknown, ip: string): Promise<LoginResult> {
  const parsed = credentialsSchema.safeParse(input);
  if (!parsed.success) return { ok: false, reason: "invalid" };
  const { email, password } = parsed.data;
  const emailKey = hashKey(email);
  const ipKey = hashKey(ip || "unknown");

  const rows = await db().execute<AuthRow>(
    sql`select id, password_hash, disabled_at from auth_find_user_by_email(${email})`,
  );
  const user = rows[0];

  if (isRateLimited(await recentFailures(emailKey, ipKey), limitsFromEnv())) {
    await recordAuthEvent("auth.login_rate_limited", user?.id ?? null);
    return { ok: false, reason: "rate_limited" };
  }

  const passwordOk = await verifyPassword(user?.password_hash ?? DUMMY_HASH, password);
  const ok = Boolean(user && user.password_hash && passwordOk && !user.disabled_at);
  await recordAttempt(emailKey, ipKey, ok);

  if (!ok || !user) {
    await recordAuthEvent("auth.login_failed", user?.id ?? null, user?.disabled_at ? { disabled: true } : {});
    return { ok: false, reason: "invalid" };
  }
  await recordAuthEvent("auth.login", user.id);
  return { ok: true, userId: user.id, email };
}
