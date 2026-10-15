import { and, asc, eq, sql } from "drizzle-orm";
import { decryptText } from "../crypto";
import { appUser, classTeacher, pupil, schoolClass } from "../db/schema";
import { env } from "../env";
import { requireRole, requireSchool, withTenant, type Ctx } from "../tenancy";
import type { Tx } from "../db/client";
import { isUuid } from "./ids";

export type ClassSummary = {
  id: string;
  name: string;
  yearGroup: number;
  subject: string;
  pupilCount: number;
};

const classColumns = {
  id: schoolClass.id,
  name: schoolClass.name,
  yearGroup: schoolClass.yearGroup,
  subject: schoolClass.subject,
  pupilCount: sql<number>`(select count(*)::int from ${pupil} where ${pupil.classId} = ${schoolClass.id})`,
};

/**
 * The one place that decides which classes a user may see. Teachers: classes
 * they are assigned to. School admins: every class in their school. Authority
 * admins: none (they see aggregates only).
 */
function visibleClasses(tx: Tx, ctx: Ctx & { schoolId: string }) {
  const base = tx.select(classColumns).from(schoolClass);
  if (ctx.role === "teacher") {
    return base
      .innerJoin(
        classTeacher,
        and(eq(classTeacher.classId, schoolClass.id), eq(classTeacher.userId, ctx.userId)),
      )
      .$dynamic();
  }
  return base.$dynamic();
}

export async function listClasses(ctx: Ctx): Promise<ClassSummary[]> {
  requireRole(ctx, "teacher", "school_admin");
  const c = requireSchool(ctx);
  return withTenant(c, (tx) =>
    visibleClasses(tx, c)
      .where(eq(schoolClass.schoolId, c.schoolId))
      .orderBy(asc(schoolClass.yearGroup), asc(schoolClass.name)),
  );
}

export async function getClass(ctx: Ctx, classId: string): Promise<ClassSummary | null> {
  if (!isUuid(classId)) return null;
  requireRole(ctx, "teacher", "school_admin");
  const c = requireSchool(ctx);
  const rows = await withTenant(c, (tx) =>
    visibleClasses(tx, c).where(and(eq(schoolClass.schoolId, c.schoolId), eq(schoolClass.id, classId))),
  );
  return rows[0] ?? null;
}

export type PupilRow = { id: string; code: string; displayName: string | null };

/**
 * Pupils in a class the user can see. Names are decrypted only for teachers;
 * school admins see codes. Names are never sent to the marking model.
 */
export async function listPupils(ctx: Ctx, classId: string): Promise<PupilRow[] | null> {
  const cls = await getClass(ctx, classId);
  if (!cls) return null;
  const c = requireSchool(ctx);
  const rows = await withTenant(c, (tx) =>
    tx
      .select({ id: pupil.id, code: pupil.code, enc: pupil.displayNameEnc })
      .from(pupil)
      .where(and(eq(pupil.schoolId, c.schoolId), eq(pupil.classId, cls.id)))
      .orderBy(asc(pupil.code)),
  );
  const showNames = ctx.role === "teacher";
  const key = showNames ? env().PUPIL_NAME_KEY : "";
  return rows.map((r) => ({
    id: r.id,
    code: r.code,
    displayName: showNames && r.enc ? decryptText(r.enc, key) : null,
  }));
}

export type TeacherRow = { id: string; displayName: string; email: string };

export async function listClassTeachers(ctx: Ctx, classId: string): Promise<TeacherRow[] | null> {
  const cls = await getClass(ctx, classId);
  if (!cls) return null;
  const c = requireSchool(ctx);
  return withTenant(c, (tx) =>
    tx
      .select({ id: appUser.id, displayName: appUser.displayName, email: appUser.email })
      .from(classTeacher)
      .innerJoin(appUser, eq(appUser.id, classTeacher.userId))
      .where(and(eq(classTeacher.schoolId, c.schoolId), eq(classTeacher.classId, cls.id)))
      .orderBy(asc(appUser.displayName)),
  );
}
