import { and, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { recordAudit } from "../audit";
import { db } from "../db/client";
import { appUser, authority, school, schoolDeletionRequest, submission } from "../db/schema";
import { storage } from "../storage";
import { ForbiddenError, requireRole, withTenant, type Ctx } from "../tenancy";
import { isUuid } from "./ids";
import { context, findSubmission, MarkingError, teacher } from "./marking";

/** A rule an admin broke (e.g. confirming their own request). Shown to them as-is. */
export class OversightError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OversightError";
  }
}

/** Postgres error code, through Drizzle's wrapper. */
function pgError(err: unknown): { code?: string; message: string } | null {
  const e = err as { code?: string; message?: string; cause?: { code?: string; message?: string } };
  if (e?.cause?.code) return { code: e.cause.code, message: e.cause.message ?? "" };
  if (e?.code) return { code: e.code, message: e.message ?? "" };
  return null;
}

/** Turn the database's refusals into errors the page can show. */
function rethrow(err: unknown): never {
  const pg = pgError(err);
  if (pg?.code === "42501") throw new ForbiddenError();
  if (pg?.code === "P0001") throw new OversightError(pg.message.charAt(0).toUpperCase() + pg.message.slice(1) + ".");
  throw err;
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

export type OversightSettings = { retentionDays: number; minutes: Record<"short" | "maths" | "essay", number> };

export async function getSettings(ctx: Ctx): Promise<OversightSettings | null> {
  requireRole(ctx, "authority_admin", "school_admin");
  const [row] = await withTenant(ctx, (tx) =>
    tx
      .select({ retentionDays: authority.retentionDays, minutes: authority.timeSavedMinutes })
      .from(authority)
      .where(eq(authority.id, ctx.authorityId)),
  );
  return row ? { retentionDays: row.retentionDays, minutes: row.minutes } : null;
}

export const retentionSchema = z.coerce.number().int().min(1, "At least 1 day.").max(3650, "At most 3650 days (10 years).");

/** Set the retention period. Approved work still held is rescheduled to match. Returns how many were rescheduled. */
export async function setRetention(ctx: Ctx, days: number): Promise<number> {
  requireRole(ctx, "authority_admin");
  const d = retentionSchema.parse(days);
  return withTenant(ctx, async (tx) => {
    const [r] = await tx.execute<{ n: number }>(sql`select app_set_retention(${d}) as n`);
    return r?.n ?? 0;
  }).catch(rethrow);
}

export const minutesSchema = z.object({
  short: z.coerce.number().min(0).max(120),
  maths: z.coerce.number().min(0).max(120),
  essay: z.coerce.number().min(0).max(120),
});

/** The assumption behind "estimated teacher time saved": minutes to mark one script by hand. */
export async function setTimeSavedMinutes(ctx: Ctx, minutes: z.input<typeof minutesSchema>): Promise<void> {
  requireRole(ctx, "authority_admin");
  const m = minutesSchema.parse(minutes);
  await withTenant(ctx, async (tx) => {
    const [before] = await tx.select({ minutes: authority.timeSavedMinutes }).from(authority).where(eq(authority.id, ctx.authorityId));
    await tx.update(authority).set({ timeSavedMinutes: m }).where(eq(authority.id, ctx.authorityId));
    await recordAudit(tx, ctx, {
      action: "settings.time_saved_changed",
      targetType: "authority",
      targetId: ctx.authorityId,
      metadata: { from: before?.minutes ?? null, to: m },
    });
  });
}

// ---------------------------------------------------------------------------
// Deleting work
// ---------------------------------------------------------------------------

/**
 * Remove stored photo bytes whose records are gone. Keys stay queued until the
 * store confirms, so a storage outage delays deletion but never loses a file.
 */
export async function drainObjectDeletions(limit = 200): Promise<{ deleted: number; failed: number }> {
  const keys = (await db().execute<{ storage_key: string }>(sql`select storage_key from app_pending_object_keys(${limit})`)).map(
    (r) => r.storage_key,
  );
  const done: string[] = [];
  let failed = 0;
  for (const key of keys) {
    try {
      await storage().delete(key);
      done.push(key);
    } catch {
      failed++;
    }
  }
  if (done.length) {
    await db().execute(sql`select app_forget_object_keys(array[${sql.join(done.map((k) => sql`${k}`), sql`, `)}]::text[])`);
  }
  return { deleted: done.length, failed };
}

/**
 * The scheduled retention run, across every school. Deletes the content of
 * approved work whose retention date has passed (keeping the marks and the
 * agreement figures) and the stored photos, and audit-logs each school.
 */
export async function runRetention(limit = 500): Promise<{ submissions: number; photos: number; schools: number }> {
  const rows = await db().execute<{ school_id: string; submissions: number; files: number }>(
    sql`select * from app_run_retention(${limit})`,
  );
  await drainObjectDeletions();
  return {
    submissions: rows.reduce((n, r) => n + r.submissions, 0),
    photos: rows.reduce((n, r) => n + r.files, 0),
    schools: rows.length,
  };
}

/**
 * A teacher deletes one pupil's work early. Approved work keeps its marks and
 * agreement figures, exactly as retention does; work not yet approved is
 * removed completely, along with any draft marks.
 */
export async function deleteWork(ctx: Ctx, assignmentId: string, pupilId: string): Promise<"content" | "all" | false> {
  const c = teacher(ctx);
  const outcome = await withTenant(c, async (tx) => {
    const found = await context(tx, c, assignmentId, pupilId);
    if (!found) return false;
    const s = await findSubmission(tx, c, found.a.id, found.p.id, true);
    if (!s) throw new MarkingError("There is no work to delete for this pupil.");
    if (s.contentDeletedAt) throw new MarkingError("This work has already been deleted.");
    let kind: "content" | "all";
    if (s.status === "approved") {
      await tx.execute(sql`select scrub_submission_content(${s.id}::uuid)`);
      kind = "content";
    } else {
      await tx.execute(sql`
        insert into pending_object_deletion (storage_key, school_id)
        select storage_key, school_id from submission_file where submission_id = ${s.id}::uuid
        on conflict do nothing`);
      await tx.delete(submission).where(and(eq(submission.schoolId, c.schoolId), eq(submission.id, s.id)));
      kind = "all";
    }
    await recordAudit(tx, c, {
      action: kind === "content" ? "submission.content_deleted" : "submission.deleted",
      targetType: "submission",
      targetId: s.id,
      metadata: { assignmentId: found.a.id, pupilId: found.p.id, wasApproved: kind === "content" },
    });
    return kind;
  });
  if (outcome) await drainObjectDeletions().catch(() => {}); // the scheduled job retries anything left
  return outcome;
}

// ---------------------------------------------------------------------------
// Delete everything for a school: two different admins
// ---------------------------------------------------------------------------

export type DeletionRequest = {
  id: string;
  requestedBy: string;
  requestedByName: string;
  requestedAt: Date;
  expiresAt: Date;
  status: "open" | "expired" | "confirmed" | "cancelled";
  confirmedAt: Date | null;
  result: Record<string, number> | null;
};

/** The school's deletion requests, newest first, for its admins and the authority admins. */
export async function listDeletionRequests(ctx: Ctx, schoolId: string): Promise<DeletionRequest[]> {
  requireRole(ctx, "authority_admin", "school_admin");
  if (!isUuid(schoolId)) return [];
  if (ctx.role === "school_admin" && ctx.schoolId !== schoolId) return [];
  const rows = await withTenant(ctx, (tx) =>
    tx
      .select({ r: schoolDeletionRequest, name: appUser.displayName })
      .from(schoolDeletionRequest)
      .leftJoin(appUser, eq(appUser.id, schoolDeletionRequest.requestedBy))
      .where(and(eq(schoolDeletionRequest.authorityId, ctx.authorityId), eq(schoolDeletionRequest.schoolId, schoolId)))
      .orderBy(desc(schoolDeletionRequest.requestedAt))
      .limit(10),
  );
  const now = Date.now();
  return rows.map(({ r, name }) => ({
    id: r.id,
    requestedBy: r.requestedBy,
    requestedByName: name ?? "",
    requestedAt: r.requestedAt,
    expiresAt: r.expiresAt,
    status: r.confirmedAt ? "confirmed" : r.cancelledAt ? (r.cancelledBy ? "cancelled" : "expired") : r.expiresAt.getTime() <= now ? "expired" : "open",
    confirmedAt: r.confirmedAt,
    result: r.result,
  }));
}

/** The school, if the caller may ask for its data to be deleted. */
export async function schoolForDeletion(ctx: Ctx, schoolId: string): Promise<{ name: string } | null> {
  requireRole(ctx, "authority_admin", "school_admin");
  if (!isUuid(schoolId)) return null;
  if (ctx.role === "school_admin" && ctx.schoolId !== schoolId) return null;
  const [row] = await withTenant(ctx, (tx) =>
    tx.select({ name: school.name }).from(school).where(and(eq(school.authorityId, ctx.authorityId), eq(school.id, schoolId))),
  );
  return row ?? null;
}

export async function requestSchoolDeletion(ctx: Ctx, schoolId: string): Promise<string> {
  requireRole(ctx, "authority_admin", "school_admin");
  if (!isUuid(schoolId)) throw new ForbiddenError();
  return withTenant(ctx, async (tx) => {
    const [r] = await tx.execute<{ id: string }>(sql`select app_request_school_deletion(${schoolId}::uuid) as id`);
    return r!.id;
  }).catch(rethrow);
}

export async function cancelSchoolDeletion(ctx: Ctx, requestId: string): Promise<boolean> {
  requireRole(ctx, "authority_admin", "school_admin");
  if (!isUuid(requestId)) throw new ForbiddenError();
  return withTenant(ctx, async (tx) => {
    const [r] = await tx.execute<{ ok: boolean }>(sql`select app_cancel_school_deletion(${requestId}::uuid) as ok`);
    return r?.ok ?? false;
  }).catch(rethrow);
}

/** The second admin confirms. Deletes every class, pupil and piece of work in the school. */
export async function confirmSchoolDeletion(ctx: Ctx, requestId: string): Promise<Record<string, number>> {
  requireRole(ctx, "authority_admin", "school_admin");
  if (!isUuid(requestId)) throw new ForbiddenError();
  const counts = await withTenant(ctx, async (tx) => {
    const [r] = await tx.execute<{ counts: Record<string, number> }>(sql`select app_confirm_school_deletion(${requestId}::uuid) as counts`);
    return r!.counts;
  }).catch(rethrow);
  await drainObjectDeletions(1000).catch(() => {});
  return counts;
}
