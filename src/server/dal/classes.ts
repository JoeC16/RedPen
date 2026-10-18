import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { recordAudit } from "../audit";
import { decryptText, encryptText } from "../crypto";
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

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

export const classInputSchema = z.object({
  name: z.string().trim().min(1, "Give the class a name").max(40),
  yearGroup: z.coerce.number().int().min(1).max(14),
  subject: z.string().trim().min(1, "Give the subject").max(60),
});
export type ClassInput = z.infer<typeof classInputSchema>;

/** Teachers create classes and are assigned to them; school admins create unassigned classes. */
export async function createClass(ctx: Ctx, input: ClassInput): Promise<string> {
  requireRole(ctx, "teacher", "school_admin");
  const c = requireSchool(ctx);
  return withTenant(c, async (tx) => {
    const rows = await tx.execute<{ id: string }>(
      sql`select app_create_class(${input.name}, ${input.yearGroup}::smallint, ${input.subject}) as id`,
    );
    const id = rows[0]!.id;
    await recordAudit(tx, c, { action: "class.created", targetType: "class", targetId: id, metadata: { yearGroup: input.yearGroup } });
    return id;
  });
}

export type ImportResult = { added: number; errors: { line: number; message: string }[] };

/**
 * Add pupils to a class from parsed CSV rows. Codes must be new to the school.
 * Names are encrypted before they reach the database. All or nothing.
 */
export async function importPupils(ctx: Ctx, classId: string, rows: { code: string; name: string | null }[]): Promise<ImportResult | null> {
  const cls = await getClass(ctx, classId);
  if (!cls) return null;
  requireRole(ctx, "teacher");
  const c = requireSchool(ctx);
  const key = env().PUPIL_NAME_KEY;
  return withTenant(c, async (tx) => {
    // Codes are unique per school; check against every code in the school, not just visible ones.
    const taken = await tx.execute<{ code: string }>(
      sql`select code from app_pupil_codes_taken(array[${sql.join(
        rows.map((r) => sql`${r.code}`),
        sql`, `,
      )}]::text[])`,
    );
    if (taken.length > 0) {
      return {
        added: 0,
        errors: taken.map((t) => ({ line: 0, message: `Code ${t.code} is already used in this school.` })),
      };
    }
    if (rows.length > 0) {
      await tx.insert(pupil).values(
        rows.map((r) => ({
          classId: cls.id,
          schoolId: c.schoolId,
          code: r.code,
          displayNameEnc: r.name ? encryptText(r.name, key) : null,
        })),
      );
    }
    await recordAudit(tx, c, {
      action: "pupils.imported",
      targetType: "class",
      targetId: cls.id,
      metadata: { added: rows.length, withNames: rows.filter((r) => r.name).length },
    });
    return { added: rows.length, errors: [] };
  });
}

export type StaffRow = { id: string; displayName: string; email: string };

/** Teachers in the school, for a school admin assigning classes. */
export async function listSchoolTeachers(ctx: Ctx): Promise<StaffRow[]> {
  requireRole(ctx, "school_admin");
  const c = requireSchool(ctx);
  return withTenant(c, (tx) =>
    tx
      .select({ id: appUser.id, displayName: appUser.displayName, email: appUser.email })
      .from(appUser)
      .where(and(eq(appUser.schoolId, c.schoolId), eq(appUser.role, "teacher"), isNull(appUser.disabledAt)))
      .orderBy(asc(appUser.displayName)),
  );
}

/** School admins share a class with a teacher, or take a teacher off it. */
export async function setClassTeacher(ctx: Ctx, classId: string, userId: string, assigned: boolean): Promise<boolean> {
  requireRole(ctx, "school_admin");
  const c = requireSchool(ctx);
  if (!isUuid(userId)) return false;
  const cls = await getClass(c, classId);
  if (!cls) return false;
  return withTenant(c, async (tx) => {
    const [t] = await tx
      .select({ id: appUser.id })
      .from(appUser)
      .where(and(eq(appUser.schoolId, c.schoolId), eq(appUser.id, userId), eq(appUser.role, "teacher")));
    if (!t) return false;
    if (assigned) {
      await tx.insert(classTeacher).values({ classId: cls.id, userId: t.id, schoolId: c.schoolId }).onConflictDoNothing();
    } else {
      await tx
        .delete(classTeacher)
        .where(and(eq(classTeacher.schoolId, c.schoolId), eq(classTeacher.classId, cls.id), eq(classTeacher.userId, t.id)));
    }
    await recordAudit(tx, c, {
      action: assigned ? "class.teacher_added" : "class.teacher_removed",
      targetType: "class",
      targetId: cls.id,
      metadata: { teacherId: t.id },
    });
    return true;
  });
}
