import { sql } from "drizzle-orm";
import { db, type Tx } from "./db/client";
import type { UserRole } from "./db/schema";

/**
 * Who is acting, resolved from the database on every request (never from the
 * client). Every data-access function takes one of these.
 */
export type Ctx = {
  userId: string;
  role: UserRole;
  authorityId: string;
  /** null only for authority admins */
  schoolId: string | null;
};

/**
 * Run `fn` in a transaction with the tenancy context set for row-level
 * security. This is the only way the data-access layer touches the database.
 * The settings are transaction-local, so a pooled connection never carries
 * one request's context into another.
 */
export async function withTenant<T>(ctx: Ctx, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return db().transaction(async (tx) => {
    await tx.execute(sql`
      select set_config('app.user_id', ${ctx.userId}, true),
             set_config('app.role', ${ctx.role}, true),
             set_config('app.authority_id', ${ctx.authorityId}, true),
             set_config('app.school_id', ${ctx.schoolId ?? ""}, true)
    `);
    return fn(tx);
  });
}

export class ForbiddenError extends Error {
  constructor(message = "Forbidden") {
    super(message);
    this.name = "ForbiddenError";
  }
}

export function requireRole(ctx: Ctx, ...roles: UserRole[]): void {
  if (!roles.includes(ctx.role)) throw new ForbiddenError();
}

/** Narrow a ctx to one with a school; throws for authority admins. */
export function requireSchool(ctx: Ctx): Ctx & { schoolId: string } {
  if (!ctx.schoolId) throw new ForbiddenError();
  return ctx as Ctx & { schoolId: string };
}
