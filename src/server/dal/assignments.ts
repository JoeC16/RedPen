import { and, asc, desc, eq, sql } from "drizzle-orm";
import { recordAudit } from "../audit";
import type { Tx } from "../db/client";
import { assignment, classTeacher, schoolClass, submission } from "../db/schema";
import type { Criterion, SchemeInput, WorkType } from "../marking/marks";
import { requireRole, requireSchool, withTenant, type Ctx } from "../tenancy";
import { isUuid } from "./ids";

export type AssignmentRow = {
  id: string;
  classId: string;
  className: string;
  title: string;
  workType: WorkType;
  schemeText: string;
  totalMarks: number;
  criteria: Criterion[];
  schemeVersion: number;
  createdAt: Date;
  updatedAt: Date;
};

type TeacherCtx = Ctx & { schoolId: string };

function teacher(ctx: Ctx): TeacherCtx {
  requireRole(ctx, "teacher");
  return requireSchool(ctx);
}

/** Teachers, or school admins reading (never writing) their school's work. */
export function reader(ctx: Ctx): TeacherCtx {
  requireRole(ctx, "teacher", "school_admin");
  return requireSchool(ctx);
}

const columns = {
  id: assignment.id,
  classId: assignment.classId,
  className: schoolClass.name,
  title: assignment.title,
  workType: assignment.workType,
  schemeText: assignment.schemeText,
  totalMarks: assignment.totalMarks,
  criteria: assignment.criteria,
  schemeVersion: assignment.schemeVersion,
  createdAt: assignment.createdAt,
  updatedAt: assignment.updatedAt,
};

/**
 * Assignments the user can see: teachers, those in classes they teach; school
 * admins, every assignment in their school (read-only: writes require the
 * teacher role first). The one place this rule lives.
 */
export function visibleAssignments(tx: Tx, ctx: TeacherCtx) {
  const base = tx.select(columns).from(assignment).innerJoin(schoolClass, eq(schoolClass.id, assignment.classId));
  const scoped =
    ctx.role === "school_admin"
      ? base
      : base.innerJoin(classTeacher, and(eq(classTeacher.classId, assignment.classId), eq(classTeacher.userId, ctx.userId)));
  return scoped.where(eq(assignment.schoolId, ctx.schoolId)).$dynamic();
}

export async function loadAssignment(tx: Tx, ctx: TeacherCtx, id: string): Promise<AssignmentRow | null> {
  if (!isUuid(id)) return null;
  const rows = await visibleAssignments(tx, ctx).where(and(eq(assignment.schoolId, ctx.schoolId), eq(assignment.id, id)));
  return rows[0] ?? null;
}

async function teachesClass(tx: Tx, ctx: TeacherCtx, classId: string): Promise<boolean> {
  if (!isUuid(classId)) return false;
  if (ctx.role === "school_admin") {
    const rows = await tx
      .select({ id: schoolClass.id })
      .from(schoolClass)
      .where(and(eq(schoolClass.schoolId, ctx.schoolId), eq(schoolClass.id, classId)));
    return rows.length > 0;
  }
  const rows = await tx
    .select({ id: classTeacher.classId })
    .from(classTeacher)
    .where(
      and(eq(classTeacher.schoolId, ctx.schoolId), eq(classTeacher.classId, classId), eq(classTeacher.userId, ctx.userId)),
    );
  return rows.length > 0;
}

export async function getAssignment(ctx: Ctx, id: string): Promise<AssignmentRow | null> {
  const c = reader(ctx);
  return withTenant(c, (tx) => loadAssignment(tx, c, id));
}

export type AssignmentListItem = AssignmentRow & { approved: number; submitted: number };

export async function listAssignments(ctx: Ctx, classId: string): Promise<AssignmentListItem[] | null> {
  if (ctx.role === "authority_admin") return [];
  const c = reader(ctx);
  return withTenant(c, async (tx) => {
    if (!(await teachesClass(tx, c, classId))) return null;
    return visibleAssignments(tx, c)
      .where(and(eq(assignment.schoolId, c.schoolId), eq(assignment.classId, classId)))
      .orderBy(desc(assignment.createdAt))
      .then((rows) =>
        Promise.all(
          rows.map(async (r) => {
            const [counts] = await tx
              .select({
                approved: sql<number>`count(*) filter (where ${submission.status} = 'approved')::int`,
                submitted: sql<number>`count(*) filter (where ${submission.text} is not null or ${submission.status} <> 'todo')::int`,
              })
              .from(submission)
              .where(and(eq(submission.schoolId, c.schoolId), eq(submission.assignmentId, r.id)));
            return { ...r, approved: counts?.approved ?? 0, submitted: counts?.submitted ?? 0 };
          }),
        ),
      );
  });
}

/** Earlier schemes from any of the teacher's classes, to reuse when setting a new assignment. */
export async function listReusableSchemes(ctx: Ctx): Promise<{ id: string; title: string; className: string; workType: WorkType }[]> {
  if (ctx.role !== "teacher") return [];
  const c = teacher(ctx);
  return withTenant(c, (tx) =>
    visibleAssignments(tx, c)
      .orderBy(desc(assignment.createdAt), asc(assignment.title))
      .limit(100)
      .then((rows) => rows.map((r) => ({ id: r.id, title: r.title, className: r.className, workType: r.workType }))),
  );
}

export async function createAssignment(ctx: Ctx, classId: string, input: SchemeInput): Promise<string | null> {
  const c = teacher(ctx);
  return withTenant(c, async (tx) => {
    if (!(await teachesClass(tx, c, classId))) return null;
    const id = crypto.randomUUID();
    await tx.insert(assignment).values({
      id,
      classId,
      schoolId: c.schoolId,
      title: input.title,
      workType: input.workType,
      schemeText: input.schemeText,
      totalMarks: input.totalMarks,
      criteria: input.criteria,
      createdBy: c.userId,
    });
    await recordAudit(tx, c, {
      action: "assignment.created",
      targetType: "assignment",
      targetId: id,
      metadata: { classId, workType: input.workType, totalMarks: input.totalMarks, lines: input.criteria.length },
    });
    return id;
  });
}

function sameScheme(a: AssignmentRow, b: SchemeInput): boolean {
  return (
    a.schemeText === b.schemeText &&
    a.totalMarks === b.totalMarks &&
    a.workType === b.workType &&
    JSON.stringify(a.criteria.map((x) => [x.label, x.max])) === JSON.stringify(b.criteria.map((x) => [x.label, x.max]))
  );
}

/**
 * Edit an assignment. A change to the scheme bumps scheme_version: approved
 * marks keep the version they were approved under, and unapproved work is
 * marked afresh against the new scheme (earlier runs are kept as history).
 */
export async function updateAssignment(
  ctx: Ctx,
  id: string,
  input: SchemeInput,
): Promise<{ schemeChanged: boolean } | null> {
  const c = teacher(ctx);
  return withTenant(c, async (tx) => {
    const current = await loadAssignment(tx, c, id);
    if (!current) return null;
    const schemeChanged = !sameScheme(current, input);
    await tx
      .update(assignment)
      .set({
        title: input.title,
        workType: input.workType,
        schemeText: input.schemeText,
        totalMarks: input.totalMarks,
        criteria: input.criteria,
        schemeVersion: schemeChanged ? current.schemeVersion + 1 : current.schemeVersion,
        updatedAt: new Date(),
      })
      .where(and(eq(assignment.schoolId, c.schoolId), eq(assignment.id, id)));
    if (schemeChanged) {
      // Unapproved work in progress goes back to the queue to be marked against the new scheme.
      await tx
        .update(submission)
        .set({ status: "todo", updatedAt: new Date() })
        .where(and(eq(submission.schoolId, c.schoolId), eq(submission.assignmentId, id), eq(submission.status, "review")));
      await recordAudit(tx, c, {
        action: "assignment.scheme_changed",
        targetType: "assignment",
        targetId: id,
        metadata: { from: current.schemeVersion, to: current.schemeVersion + 1, totalMarks: input.totalMarks },
      });
    }
    return { schemeChanged };
  });
}
