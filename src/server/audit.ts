import { sql } from "drizzle-orm";
import { db, type Tx } from "./db/client";
import { auditEvent } from "./db/schema";
import type { Ctx } from "./tenancy";

/**
 * Audit actions. Metadata must never contain pupil work, pupil names or
 * passwords: ids, counts and short labels only.
 */
export type AuditAction =
  | "auth.login"
  | "auth.login_failed"
  | "auth.login_rate_limited"
  | "auth.logout";

export type AuditInput = {
  action: AuditAction;
  targetType?: string;
  targetId?: string;
  metadata?: Record<string, unknown>;
  /** Defaults to the actor's own school. Authority admins may name one of their schools. */
  schoolId?: string | null;
};

/** Append an audit event inside an existing tenant transaction. */
export async function recordAudit(tx: Tx, ctx: Ctx, input: AuditInput): Promise<void> {
  await tx.insert(auditEvent).values({
    actorId: ctx.userId,
    authorityId: ctx.authorityId,
    schoolId: input.schoolId === undefined ? ctx.schoolId : input.schoolId,
    action: input.action,
    targetType: input.targetType ?? null,
    targetId: input.targetId ?? null,
    metadata: input.metadata ?? {},
  });
}

/** Authentication events, recorded before or after any tenancy context exists. */
export async function recordAuthEvent(
  action: Extract<AuditAction, `auth.${string}`>,
  userId: string | null,
  metadata: Record<string, unknown> = {},
): Promise<void> {
  await db().execute(sql`select audit_auth_event(${action}, ${userId}::uuid, ${JSON.stringify(metadata)}::jsonb)`);
}
