import { and, eq, gte, lt, sql } from "drizzle-orm";
import { db } from "../db/client";
import { loginAttempt } from "../db/schema";
import { env } from "../env";

export type Limits = { perEmail: number; perIp: number };

/** Pure decision: blocked once recent failures reach either limit. */
export function isRateLimited(failures: { email: number; ip: number }, limits: Limits): boolean {
  return failures.email >= limits.perEmail || failures.ip >= limits.perIp;
}

function windowStart(): Date {
  return new Date(Date.now() - env().LOGIN_WINDOW_MINUTES * 60_000);
}

export async function recentFailures(emailKey: string, ipKey: string): Promise<{ email: number; ip: number }> {
  const since = windowStart();
  const [row] = await db()
    .select({
      email: sql<number>`count(*) filter (where ${loginAttempt.emailKey} = ${emailKey})::int`,
      ip: sql<number>`count(*) filter (where ${loginAttempt.ipKey} = ${ipKey})::int`,
    })
    .from(loginAttempt)
    .where(and(eq(loginAttempt.succeeded, false), gte(loginAttempt.createdAt, since)));
  return { email: row?.email ?? 0, ip: row?.ip ?? 0 };
}

export async function recordAttempt(emailKey: string, ipKey: string, succeeded: boolean): Promise<void> {
  const d = db();
  if (succeeded) {
    // A successful sign-in clears that account's failure count.
    await d.delete(loginAttempt).where(eq(loginAttempt.emailKey, emailKey));
  } else {
    await d.insert(loginAttempt).values({ emailKey, ipKey, succeeded });
  }
  // Keep the table small: drop anything older than a day.
  await d.delete(loginAttempt).where(lt(loginAttempt.createdAt, new Date(Date.now() - 86_400_000)));
}

export function limitsFromEnv(): Limits {
  const e = env();
  return { perEmail: e.LOGIN_MAX_FAILURES_PER_EMAIL, perIp: e.LOGIN_MAX_FAILURES_PER_IP };
}
