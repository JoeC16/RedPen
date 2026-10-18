import postgres from "postgres";
import { IDS } from "../scripts/lib/fixtures";
import { ctxForUserId, type SessionUser } from "../src/server/user-context";

export { IDS, EMAILS, DEMO_PASSWORD } from "../scripts/lib/fixtures";

export type FixtureUser = keyof typeof IDS;

export async function ctxOf(key: FixtureUser): Promise<SessionUser> {
  const ctx = await ctxForUserId(IDS[key]);
  if (!ctx) throw new Error(`fixture user ${key} has no active context`);
  return ctx;
}

let appSql: postgres.Sql | undefined;
let adminSql: postgres.Sql | undefined;

/** Raw connection as the application role, i.e. subject to row-level security. */
export function appConn() {
  appSql ??= postgres(process.env.DATABASE_URL!, { max: 2, onnotice: () => {} });
  return appSql;
}

/** Raw connection as the schema owner (bypasses RLS). For setup and assertions only. */
export function adminConn() {
  adminSql ??= postgres(process.env.DATABASE_ADMIN_URL!, { max: 2, onnotice: () => {} });
  return adminSql;
}

type RawCtx = { userId?: string; role?: string; schoolId?: string | null; authorityId?: string };

/**
 * Run raw SQL as the app role with a given tenancy context and NO application
 * filtering, to prove the database itself enforces isolation.
 */
export async function asApp<T>(ctx: RawCtx, fn: (sql: postgres.TransactionSql) => Promise<T>): Promise<T> {
  let result!: T;
  await appConn().begin(async (tx) => {
    await tx`select set_config('app.user_id', ${ctx.userId ?? ""}, true),
                    set_config('app.role', ${ctx.role ?? ""}, true),
                    set_config('app.school_id', ${ctx.schoolId ?? ""}, true),
                    set_config('app.authority_id', ${ctx.authorityId ?? ""}, true)`;
    result = await fn(tx);
  });
  return result;
}

export async function rawCtxOf(key: FixtureUser): Promise<RawCtx> {
  const c = await ctxOf(key);
  return { userId: c.userId, role: c.role, schoolId: c.schoolId, authorityId: c.authorityId };
}
