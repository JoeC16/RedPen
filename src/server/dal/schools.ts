import { and, asc, eq, sql } from "drizzle-orm";
import { authority, school } from "../db/schema";
import { withTenant, type Ctx } from "../tenancy";
import { isUuid } from "./ids";

export type SchoolSummary = { id: string; name: string; staffCount: number };

const columns = {
  id: school.id,
  name: school.name,
  // Written out in full: Drizzle leaves columns unqualified inside a select's sql, which would bind to the subquery.
  staffCount: sql<number>`(select count(*)::int from app_user u where u.school_id = "school"."id" and u.disabled_at is null)`,
};

/** Authority admins see every school in their authority; everyone else sees only their own. */
function scope(ctx: Ctx) {
  return ctx.role === "authority_admin"
    ? eq(school.authorityId, ctx.authorityId)
    : and(eq(school.authorityId, ctx.authorityId), eq(school.id, ctx.schoolId ?? "")); 
}

export async function listSchools(ctx: Ctx): Promise<SchoolSummary[]> {
  if (ctx.role !== "authority_admin" && !ctx.schoolId) return [];
  return withTenant(ctx, (tx) => tx.select(columns).from(school).where(scope(ctx)).orderBy(asc(school.name)));
}

export async function getSchool(ctx: Ctx, schoolId: string): Promise<SchoolSummary | null> {
  if (!isUuid(schoolId)) return null;
  if (ctx.role !== "authority_admin" && ctx.schoolId !== schoolId) return null;
  const rows = await withTenant(ctx, (tx) =>
    tx.select(columns).from(school).where(and(scope(ctx), eq(school.id, schoolId))),
  );
  return rows[0] ?? null;
}

export type AuthorityInfo = { id: string; name: string; isDemo: boolean; retentionDays: number };

export async function getAuthority(ctx: Ctx): Promise<AuthorityInfo | null> {
  const rows = await withTenant(ctx, (tx) =>
    tx
      .select({ id: authority.id, name: authority.name, isDemo: authority.isDemo, retentionDays: authority.retentionDays })
      .from(authority)
      .where(eq(authority.id, ctx.authorityId)),
  );
  return rows[0] ?? null;
}

export type SchoolName = { id: string; name: string };

/** The current user's own school name, for page headers. */
export async function ownSchoolName(ctx: Ctx): Promise<string | null> {
  if (!ctx.schoolId) return null;
  const rows = await withTenant(ctx, (tx) =>
    tx.select({ name: school.name }).from(school).where(and(eq(school.authorityId, ctx.authorityId), eq(school.id, ctx.schoolId!))),
  );
  return rows[0]?.name ?? null;
}
