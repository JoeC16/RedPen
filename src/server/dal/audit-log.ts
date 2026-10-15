import { and, desc, eq, gte, ilike, lt, or, sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { z } from "zod";
import { appUser, auditEvent, school } from "../db/schema";
import { requireRole, withTenant, type Ctx } from "../tenancy";

export const auditFilterSchema = z.object({
  actor: z.string().trim().max(254).optional(),
  action: z
    .string()
    .trim()
    .max(64)
    .regex(/^[a-z_.]*$/)
    .optional(),
  from: z.iso.date().optional(),
  to: z.iso.date().optional(),
  before: z.coerce.number().int().positive().optional(),
});
export type AuditFilter = z.infer<typeof auditFilterSchema>;

export type AuditRow = {
  id: number;
  createdAt: Date;
  action: string;
  actorEmail: string | null;
  actorName: string | null;
  schoolName: string | null;
  targetType: string | null;
  targetId: string | null;
  /** Display name of the target when it is a user the viewer can see. */
  targetName: string | null;
  metadata: Record<string, unknown>;
};

export const AUDIT_PAGE_SIZE = 100;

function escapeLike(s: string) {
  return s.replace(/[\\%_]/g, (m) => `\\${m}`);
}

/** Audit search. School admins: their school. Authority admins: the whole authority. Teachers: no access. */
export async function searchAudit(ctx: Ctx, filter: AuditFilter): Promise<AuditRow[]> {
  requireRole(ctx, "school_admin", "authority_admin");
  const conds: SQL[] = [eq(auditEvent.authorityId, ctx.authorityId)];
  if (ctx.role === "school_admin") conds.push(eq(auditEvent.schoolId, ctx.schoolId ?? ""));
  if (filter.action) conds.push(ilike(auditEvent.action, `${escapeLike(filter.action)}%`));
  if (filter.actor) {
    const like = `%${escapeLike(filter.actor)}%`;
    conds.push(or(ilike(appUser.email, like), ilike(appUser.displayName, like))!);
  }
  if (filter.from) conds.push(gte(auditEvent.createdAt, new Date(`${filter.from}T00:00:00Z`)));
  if (filter.to) conds.push(lt(auditEvent.createdAt, new Date(new Date(`${filter.to}T00:00:00Z`).getTime() + 86_400_000)));
  if (filter.before) conds.push(lt(auditEvent.id, filter.before));

  const targetUser = alias(appUser, "target_user");
  return withTenant(ctx, (tx) =>
    tx
      .select({
        id: auditEvent.id,
        createdAt: auditEvent.createdAt,
        action: auditEvent.action,
        actorEmail: appUser.email,
        actorName: appUser.displayName,
        schoolName: school.name,
        targetType: auditEvent.targetType,
        targetId: auditEvent.targetId,
        targetName: targetUser.displayName,
        metadata: auditEvent.metadata,
      })
      .from(auditEvent)
      .leftJoin(appUser, eq(appUser.id, auditEvent.actorId))
      .leftJoin(school, eq(school.id, auditEvent.schoolId))
      .leftJoin(
        targetUser,
        and(eq(auditEvent.targetType, "user"), eq(sql`${targetUser.id}::text`, auditEvent.targetId)),
      )
      .where(and(...conds))
      .orderBy(desc(auditEvent.id))
      .limit(AUDIT_PAGE_SIZE),
  );
}
