import { and, asc, desc, eq, inArray, isNull, lt, or, sql } from "drizzle-orm";
import { recordAudit } from "../audit";
import { decryptText } from "../crypto";
import type { Tx } from "../db/client";
import { approval, appUser, authority, markingRequest, markLine, markResult, pupil, submission, type SubmissionStatus } from "../db/schema";
import { enqueueMarking } from "../marking/queue";
import { env } from "../env";
import { agreement, clampMark, finalTotal, sortQueue, type QueueItem } from "../marking/marks";
import { requireRole, requireSchool, withTenant, type Ctx } from "../tenancy";
import { loadAssignment, reader, type AssignmentRow } from "./assignments";
import { photosFor, type PhotoView } from "./photos";
import { isUuid } from "./ids";

type TeacherCtx = Ctx & { schoolId: string };

/** @internal data-access layer only */
export function teacher(ctx: Ctx): TeacherCtx {
  requireRole(ctx, "teacher");
  return requireSchool(ctx);
}

/** A rule the teacher broke (e.g. approving with blank marks). Shown to them as-is. */
export class MarkingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MarkingError";
  }
}

type PupilRef = { id: string; code: string; displayName: string | null };

/** Pupil names are decrypted for teachers only; school admins see codes. */
function decryptName(ctx: Ctx, enc: string | null): string | null {
  return enc && ctx.role === "teacher" ? decryptText(enc, env().PUPIL_NAME_KEY) : null;
}

async function loadPupil(tx: Tx, ctx: TeacherCtx, a: AssignmentRow, pupilId: string): Promise<PupilRef | null> {
  if (!isUuid(pupilId)) return null;
  const rows = await tx
    .select({ id: pupil.id, code: pupil.code, enc: pupil.displayNameEnc })
    .from(pupil)
    .where(and(eq(pupil.schoolId, ctx.schoolId), eq(pupil.classId, a.classId), eq(pupil.id, pupilId)));
  const p = rows[0];
  return p ? { id: p.id, code: p.code, displayName: decryptName(ctx, p.enc) } : null;
}

type SubmissionRow = typeof submission.$inferSelect;

async function findSubmission(tx: Tx, ctx: TeacherCtx, assignmentId: string, pupilId: string, lock = false) {
  const q = tx
    .select()
    .from(submission)
    .where(and(eq(submission.schoolId, ctx.schoolId), eq(submission.assignmentId, assignmentId), eq(submission.pupilId, pupilId)));
  const rows = lock ? await q.for("update") : await q;
  return rows[0] ?? null;
}

/** @internal data-access layer only */
export async function ensureSubmission(tx: Tx, ctx: TeacherCtx, a: AssignmentRow, pupilId: string): Promise<SubmissionRow> {
  const existing = await findSubmission(tx, ctx, a.id, pupilId, true);
  if (existing) return existing;
  await tx
    .insert(submission)
    .values({ assignmentId: a.id, pupilId, classId: a.classId, schoolId: ctx.schoolId })
    .onConflictDoNothing();
  const created = await findSubmission(tx, ctx, a.id, pupilId, true);
  if (!created) throw new Error("submission not created");
  return created;
}

export type LineView = {
  position: number;
  label: string;
  max: number;
  aiAwarded: number | null;
  finalAwarded: number | null;
  evidence: string | null;
  comment: string | null;
  /** The AI's one-sentence reason, kept apart from the teacher's note. */
  aiComment: string | null;
};

type RunView = {
  id: string;
  /** The photos this run read (AI runs). */
  inputFileIds: string[];
  runNumber: number;
  source: "manual" | "ai";
  confidence: "high" | "medium" | "low" | null;
  flags: string[];
  transcription: string | null;
  feedbackDraft: string | null;
  lines: LineView[];
};

/** The run that applies to the submission now: same assignment and scheme version. */
async function currentRun(tx: Tx, ctx: TeacherCtx, s: SubmissionRow, a: AssignmentRow): Promise<RunView | null> {
  const runs = await tx
    .select()
    .from(markResult)
    .where(
      and(
        eq(markResult.schoolId, ctx.schoolId),
        eq(markResult.submissionId, s.id),
        eq(markResult.assignmentId, a.id),
        eq(markResult.schemeVersion, a.schemeVersion),
      ),
    )
    .orderBy(desc(markResult.runNumber))
    .limit(1);
  const run = runs[0];
  if (!run) return null;
  const lines = await tx
    .select({
      position: markLine.position,
      label: markLine.label,
      max: markLine.max,
      aiAwarded: markLine.aiAwarded,
      finalAwarded: markLine.finalAwarded,
      evidence: markLine.evidence,
      comment: markLine.comment,
      aiComment: markLine.aiComment,
    })
    .from(markLine)
    .where(and(eq(markLine.schoolId, ctx.schoolId), eq(markLine.markResultId, run.id)))
    .orderBy(asc(markLine.position));
  return {
    id: run.id,
    inputFileIds: run.inputFileIds,
    runNumber: run.runNumber,
    source: run.source,
    confidence: run.confidence,
    flags: run.flags,
    transcription: run.transcription,
    feedbackDraft: run.feedbackDraft,
    lines,
  };
}

function blankLines(a: AssignmentRow): LineView[] {
  return a.criteria.map((c, i) => ({
    position: i,
    label: c.label,
    max: c.max,
    aiAwarded: null,
    finalAwarded: null,
    evidence: null,
    comment: null,
    aiComment: null,
  }));
}

async function startManualRun(tx: Tx, ctx: TeacherCtx, s: SubmissionRow, a: AssignmentRow): Promise<RunView> {
  const [last] = await tx
    .select({ n: sql<number>`coalesce(max(${markResult.runNumber}), 0)::int` })
    .from(markResult)
    .where(and(eq(markResult.schoolId, ctx.schoolId), eq(markResult.submissionId, s.id)));
  const id = crypto.randomUUID();
  const runNumber = (last?.n ?? 0) + 1;
  await tx.insert(markResult).values({
    id,
    submissionId: s.id,
    classId: s.classId,
    schoolId: ctx.schoolId,
    assignmentId: a.id,
    schemeVersion: a.schemeVersion,
    runNumber,
    source: "manual",
    createdBy: ctx.userId,
  });
  const lines = blankLines(a);
  await tx.insert(markLine).values(
    lines.map((l) => ({ markResultId: id, classId: s.classId, schoolId: ctx.schoolId, position: l.position, label: l.label, max: l.max })),
  );
  return { id, inputFileIds: [], runNumber, source: "manual", confidence: null, flags: [], transcription: null, feedbackDraft: null, lines };
}

// ---------------------------------------------------------------------------
// Review queue
// ---------------------------------------------------------------------------

export type QueueRow = QueueItem & {
  pupilId: string;
  displayName: string | null;
  submissionId: string | null;
  total: number | null;
  /** The AI's suggested total, when every line has a suggestion. */
  aiTotal: number | null;
  photoCount: number;
};

export async function reviewQueue(ctx: Ctx, assignmentId: string): Promise<{ assignment: AssignmentRow; rows: QueueRow[] } | null> {
  const c = reader(ctx);
  return withTenant(c, async (tx) => {
    const a = await loadAssignment(tx, c, assignmentId);
    if (!a) return null;
    // Latest run per submission under the current scheme version, with its line totals.
    const rows = await tx.execute<{
      pupil_id: string;
      code: string;
      enc: string | null;
      submission_id: string | null;
      status: SubmissionStatus | null;
      absent: boolean | null;
      has_work: boolean;
      photo_count: number | null;
      confidence: "high" | "medium" | "low" | null;
      flag_count: number | null;
      total: string | null;
      unmarked: number | null;
      ai_total: string | null;
      ai_unmarked: number | null;
    }>(sql`
      select p.id as pupil_id, p.code, p.display_name_enc as enc,
             s.id as submission_id, s.status, s.absent,
             ((s.text is not null and length(s.text) > 0)
               or exists (select 1 from submission_file f where f.submission_id = s.id)) as has_work,
             (select count(*)::int from submission_file f where f.submission_id = s.id) as photo_count,
             r.confidence, jsonb_array_length(r.flags) as flag_count,
             (select sum(final_awarded) from mark_line l where l.mark_result_id = r.id) as total,
             (select count(*)::int from mark_line l where l.mark_result_id = r.id and l.final_awarded is null) as unmarked,
             (select sum(ai_awarded) from mark_line l where l.mark_result_id = r.id) as ai_total,
             (select count(*)::int from mark_line l where l.mark_result_id = r.id and l.ai_awarded is null) as ai_unmarked
      from pupil p
      left join submission s on s.pupil_id = p.id and s.assignment_id = ${a.id} and s.school_id = ${c.schoolId}
      left join lateral (
        select * from mark_result m
        where m.submission_id = s.id and m.assignment_id = ${a.id} and m.scheme_version = ${a.schemeVersion}
        order by m.run_number desc limit 1
      ) r on true
      where p.school_id = ${c.schoolId} and p.class_id = ${a.classId}
    `);
    const items: QueueRow[] = rows.map((r) => ({
      pupilId: r.pupil_id,
      pupilCode: r.code,
      displayName: decryptName(c, r.enc),
      submissionId: r.submission_id,
      status: r.status ?? "todo",
      absent: r.absent ?? false,
      hasWork: r.has_work ?? false,
      photoCount: r.photo_count ?? 0,
      confidence: r.confidence,
      flagCount: r.flag_count ?? 0,
      total: r.total !== null && r.unmarked === 0 ? Number(r.total) : null,
      aiTotal: r.ai_total !== null && r.ai_unmarked === 0 ? Number(r.ai_total) : null,
    }));
    return { assignment: a, rows: sortQueue(items) };
  });
}

// ---------------------------------------------------------------------------
// One pupil's review screen
// ---------------------------------------------------------------------------

export type ReviewView = {
  assignment: AssignmentRow;
  pupil: PupilRef;
  submission: {
    id: string;
    text: string | null;
    absent: boolean;
    status: SubmissionStatus;
    feedback: string | null;
    failureReason: string | null;
  } | null;
  run: RunView | null;
  photos: PhotoView[];
  lines: LineView[];
  approval: { approvedAt: Date; approvedBy: string; finalTotal: number } | null;
  history: { approvedAt: Date; reopenedAt: Date | null; reopenReason: string | null; finalTotal: number }[];
  prevPupilId: string | null;
  nextPupilId: string | null;
};

export async function getReview(ctx: Ctx, assignmentId: string, pupilId: string): Promise<ReviewView | null> {
  const queue = await reviewQueue(ctx, assignmentId);
  if (!queue) return null;
  const c = reader(ctx);
  return withTenant(c, async (tx) => {
    const a = queue.assignment;
    const p = await loadPupil(tx, c, a, pupilId);
    if (!p) return null;
    const s = await findSubmission(tx, c, a.id, p.id);
    const run = s ? await currentRun(tx, c, s, a) : null;
    let current: ReviewView["approval"] = null;
    let history: ReviewView["history"] = [];
    if (s) {
      const approvals = await tx
        .select({
          approvedAt: approval.approvedAt,
          approvedBy: appUser.displayName,
          finalTotal: approval.finalTotal,
          reopenedAt: approval.reopenedAt,
          reopenReason: approval.reopenReason,
        })
        .from(approval)
        .leftJoin(appUser, eq(appUser.id, approval.approvedBy))
        .where(and(eq(approval.schoolId, c.schoolId), eq(approval.submissionId, s.id)))
        .orderBy(desc(approval.approvedAt));
      const live = approvals.find((x) => x.reopenedAt === null);
      if (live) current = { approvedAt: live.approvedAt, approvedBy: live.approvedBy ?? "", finalTotal: live.finalTotal };
      history = approvals.map((x) => ({ approvedAt: x.approvedAt, reopenedAt: x.reopenedAt, reopenReason: x.reopenReason, finalTotal: x.finalTotal }));
    }
    if (c.role === "school_admin" && s) {
      // Leaders reading pupil work is allowed, and recorded.
      await recordAudit(tx, c, { action: "submission.viewed", targetType: "submission", targetId: s.id, metadata: { assignmentId: a.id } });
    }
    const order = queue.rows.map((r) => r.pupilId);
    const idx = order.indexOf(p.id);
    return {
      assignment: a,
      pupil: p,
      submission: s
        ? { id: s.id, text: s.text, absent: s.absent, status: s.status, feedback: s.feedback, failureReason: s.failureReason }
        : null,
      run,
      photos: s ? await photosFor(tx, c, s.id) : [],
      lines: run?.lines ?? blankLines(a),
      approval: current,
      history,
      prevPupilId: idx > 0 ? order[idx - 1]! : null,
      nextPupilId: idx >= 0 && idx < order.length - 1 ? order[idx + 1]! : null,
    };
  });
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

/** @internal data-access layer only: the assignment and pupil, if the teacher may see both. */
export async function context(tx: Tx, c: TeacherCtx, assignmentId: string, pupilId: string) {
  const a = await loadAssignment(tx, c, assignmentId);
  if (!a) return null;
  const p = await loadPupil(tx, c, a, pupilId);
  if (!p) return null;
  return { a, p };
}

/** @internal data-access layer only */
export function assertUnlocked(s: SubmissionRow) {
  if (s.status === "approved") throw new MarkingError("This work is approved. Reopen it to make changes.");
}

/** Add or replace a pupil's typed work. Clears an absent mark. */
export async function saveWork(ctx: Ctx, assignmentId: string, pupilId: string, text: string): Promise<boolean> {
  const c = teacher(ctx);
  return withTenant(c, async (tx) => {
    const found = await context(tx, c, assignmentId, pupilId);
    if (!found) return false;
    const s = await ensureSubmission(tx, c, found.a, found.p.id);
    assertUnlocked(s);
    const value = text.trim() === "" ? null : text;
    await tx
      .update(submission)
      .set({ text: value, absent: false, updatedAt: new Date() })
      .where(and(eq(submission.schoolId, c.schoolId), eq(submission.id, s.id)));
    // Content never goes in the audit log: length only.
    await recordAudit(tx, c, {
      action: "submission.work_saved",
      targetType: "submission",
      targetId: s.id,
      metadata: { characters: value?.length ?? 0 },
    });
    return true;
  });
}

/** Save typed work for several pupils at once; blank entries are left alone. */
export async function saveWorkBulk(ctx: Ctx, assignmentId: string, entries: { pupilId: string; text: string }[]): Promise<number> {
  let saved = 0;
  for (const e of entries) {
    if (e.text.trim() === "") continue;
    if (await saveWork(ctx, assignmentId, e.pupilId, e.text)) saved++;
  }
  return saved;
}

export async function setAbsent(ctx: Ctx, assignmentId: string, pupilId: string, absent: boolean): Promise<boolean> {
  const c = teacher(ctx);
  return withTenant(c, async (tx) => {
    const found = await context(tx, c, assignmentId, pupilId);
    if (!found) return false;
    const s = await ensureSubmission(tx, c, found.a, found.p.id);
    assertUnlocked(s);
    await tx
      .update(submission)
      .set({ absent, status: absent ? "todo" : s.status, updatedAt: new Date() })
      .where(and(eq(submission.schoolId, c.schoolId), eq(submission.id, s.id)));
    await recordAudit(tx, c, { action: absent ? "submission.marked_absent" : "submission.marked_present", targetType: "submission", targetId: s.id });
    return true;
  });
}

export type MarksInput = {
  lines: { position: number; finalAwarded: number | null; comment: string | null }[];
  feedback: string;
};

/** Save the teacher's marks and feedback as a draft. Marks are rounded to half marks and clamped. */
export async function saveMarks(ctx: Ctx, assignmentId: string, pupilId: string, input: MarksInput): Promise<boolean> {
  const c = teacher(ctx);
  return withTenant(c, async (tx) => {
    const found = await context(tx, c, assignmentId, pupilId);
    if (!found) return false;
    const { a } = found;
    const s = await ensureSubmission(tx, c, a, found.p.id);
    assertUnlocked(s);
    if (s.absent) throw new MarkingError("This pupil is marked absent. Mark them present first.");
    const run = (await currentRun(tx, c, s, a)) ?? (await startManualRun(tx, c, s, a));
    for (const line of run.lines) {
      const given = input.lines.find((l) => l.position === line.position);
      if (!given) continue;
      await tx
        .update(markLine)
        .set({
          finalAwarded: given.finalAwarded === null ? null : clampMark(given.finalAwarded, line.max),
          comment: given.comment?.trim() ? given.comment.trim().slice(0, 1000) : null,
        })
        .where(and(eq(markLine.schoolId, c.schoolId), eq(markLine.markResultId, run.id), eq(markLine.position, line.position)));
    }
    await tx
      .update(submission)
      .set({ feedback: input.feedback.trim() ? input.feedback.trim().slice(0, 5000) : null, status: "review", updatedAt: new Date() })
      .where(and(eq(submission.schoolId, c.schoolId), eq(submission.id, s.id)));
    return true;
  });
}

/**
 * Approve one pupil's marks: writes an approval, locks the marks, records the
 * agreement data and sets the retention date. One pupil at a time, by design.
 */
export async function approve(ctx: Ctx, assignmentId: string, pupilId: string): Promise<boolean> {
  const c = teacher(ctx);
  return withTenant(c, async (tx) => {
    const found = await context(tx, c, assignmentId, pupilId);
    if (!found) return false;
    const { a } = found;
    const s = await findSubmission(tx, c, a.id, found.p.id, true);
    if (!s) throw new MarkingError("Enter marks before approving.");
    assertUnlocked(s);
    if (s.absent) throw new MarkingError("This pupil is marked absent, so there is nothing to approve.");
    const run = await currentRun(tx, c, s, a);
    const total = run ? finalTotal(run.lines) : null;
    if (!run || total === null) throw new MarkingError("Every mark line needs a mark before you approve.");
    const { aiTotal, linesChanged } = agreement(run.lines);
    const [auth] = await tx.select({ days: authority.retentionDays }).from(authority).where(eq(authority.id, c.authorityId));
    const now = new Date();
    await tx.insert(approval).values({
      submissionId: s.id,
      classId: s.classId,
      schoolId: c.schoolId,
      markResultId: run.id,
      approvedBy: c.userId,
      approvedAt: now,
      finalTotal: total,
      finalFeedback: s.feedback,
      aiTotal,
      linesChanged,
    });
    await tx
      .update(submission)
      .set({ status: "approved", updatedAt: now, deleteAfter: new Date(now.getTime() + (auth?.days ?? 30) * 86_400_000) })
      .where(and(eq(submission.schoolId, c.schoolId), eq(submission.id, s.id)));
    await recordAudit(tx, c, {
      action: "submission.approved",
      targetType: "submission",
      targetId: s.id,
      metadata: { assignmentId: a.id, total, outOf: a.totalMarks, run: run.runNumber, source: run.source, linesChanged },
    });
    return true;
  });
}

/** Reopen approved work. Keeps the old approval for the record; audit logged with the reason. */
export async function reopen(ctx: Ctx, assignmentId: string, pupilId: string, reason: string): Promise<boolean> {
  const c = teacher(ctx);
  const why = reason.trim();
  if (why.length < 3) throw new MarkingError("Give a short reason for reopening.");
  return withTenant(c, async (tx) => {
    const found = await context(tx, c, assignmentId, pupilId);
    if (!found) return false;
    const s = await findSubmission(tx, c, found.a.id, found.p.id, true);
    if (!s || s.status !== "approved") throw new MarkingError("Only approved work can be reopened.");
    const now = new Date();
    await tx
      .update(approval)
      .set({ reopenedAt: now, reopenedBy: c.userId, reopenReason: why.slice(0, 500) })
      .where(and(eq(approval.schoolId, c.schoolId), eq(approval.submissionId, s.id), isNull(approval.reopenedAt)));
    await tx
      .update(submission)
      .set({ status: "review", updatedAt: now, deleteAfter: null })
      .where(and(eq(submission.schoolId, c.schoolId), eq(submission.id, s.id)));
    await recordAudit(tx, c, {
      action: "submission.reopened",
      targetType: "submission",
      targetId: s.id,
      metadata: { assignmentId: found.a.id, reason: why.slice(0, 500) },
    });
    return true;
  });
}

/**
 * Work handed in against the wrong assignment: move it to another assignment
 * in the same class. Marks made against the old scheme stay as history.
 */
export async function moveWork(ctx: Ctx, assignmentId: string, pupilId: string, targetAssignmentId: string): Promise<boolean> {
  const c = teacher(ctx);
  return withTenant(c, async (tx) => {
    const found = await context(tx, c, assignmentId, pupilId);
    if (!found) return false;
    const target = await loadAssignment(tx, c, targetAssignmentId);
    if (!target || target.classId !== found.a.classId || target.id === found.a.id) return false;
    const s = await findSubmission(tx, c, found.a.id, found.p.id, true);
    if (!s) throw new MarkingError("There is no work to move.");
    assertUnlocked(s);
    if (await findSubmission(tx, c, target.id, found.p.id)) {
      throw new MarkingError(`${found.p.code} already has work in "${target.title}".`);
    }
    await tx
      .update(submission)
      .set({ assignmentId: target.id, status: "todo", updatedAt: new Date() })
      .where(and(eq(submission.schoolId, c.schoolId), eq(submission.id, s.id)));
    await recordAudit(tx, c, {
      action: "submission.moved",
      targetType: "submission",
      targetId: s.id,
      metadata: { from: found.a.id, to: target.id },
    });
    return true;
  });
}

// ---------------------------------------------------------------------------
// AI marking
// ---------------------------------------------------------------------------

const STALE_MARKING_MS = 15 * 60_000;

function limits() {
  return {
    teacher: Number(process.env.MARKING_LIMIT_PER_TEACHER_PER_HOUR ?? 300),
    school: Number(process.env.MARKING_LIMIT_PER_SCHOOL_PER_HOUR ?? 1500),
  };
}

/**
 * Send work for AI marking as background jobs. With no pupil given, marks the
 * whole class: every pupil with typed work who is not absent, not approved and
 * not already marked under the current scheme (failed and stuck jobs are
 * retried). With a pupil, re-marks that one (a new run; history is kept).
 * Rate limited per teacher and per school. Returns how many were queued.
 */
export async function startMarking(ctx: Ctx, assignmentId: string, pupilId?: string): Promise<{ queued: number }> {
  const c = teacher(ctx);
  const picked = await withTenant(c, async (tx) => {
    const a = await loadAssignment(tx, c, assignmentId);
    if (!a) return null;
    if (pupilId !== undefined && !isUuid(pupilId)) return null;
    const staleBefore = new Date(Date.now() - STALE_MARKING_MS);
    const eligibleStatus = pupilId
      ? inArray(submission.status, ["todo", "failed", "review", "marking"])
      : or(inArray(submission.status, ["todo", "failed"]), and(eq(submission.status, "marking"), lt(submission.updatedAt, staleBefore)));
    const rows = await tx
      .select({ id: submission.id, status: submission.status, updatedAt: submission.updatedAt })
      .from(submission)
      .where(
        and(
          eq(submission.schoolId, c.schoolId),
          eq(submission.assignmentId, a.id),
          eq(submission.absent, false),
          sql`(coalesce(length(trim(${submission.text})), 0) > 0 or exists (select 1 from submission_file f where f.submission_id = ${submission.id}))`,
          eligibleStatus,
          ...(pupilId ? [eq(submission.pupilId, pupilId)] : []),
        ),
      )
      .for("update");
    // A single pupil already being marked (and not stuck) is left alone.
    const ids = rows.filter((r) => !(pupilId && r.status === "marking" && r.updatedAt >= staleBefore)).map((r) => r.id);
    if (ids.length === 0) return { a, ids };

    const lim = limits();
    const [counts] = await tx.execute<{ mine: number; school: number }>(
      sql`select * from app_marking_counts(${new Date(Date.now() - 3_600_000).toISOString()}::timestamptz)`,
    );
    const mine = counts?.mine ?? 0;
    const school = counts?.school ?? 0;
    if (mine + ids.length > lim.teacher) {
      throw new MarkingError(
        `You can send up to ${lim.teacher} scripts an hour for AI marking. You have ${Math.max(0, lim.teacher - mine)} left this hour, and this would send ${ids.length}. Try again later, or mark by hand.`,
      );
    }
    if (school + ids.length > lim.school) {
      throw new MarkingError(
        `Your school has reached its hourly AI marking limit of ${lim.school} scripts (${Math.max(0, lim.school - school)} left). Try again later, or mark by hand.`,
      );
    }
    await tx
      .update(submission)
      .set({ status: "marking", failureReason: null, updatedAt: new Date() })
      .where(and(eq(submission.schoolId, c.schoolId), inArray(submission.id, ids)));
    await tx.insert(markingRequest).values(ids.map((id) => ({ schoolId: c.schoolId, userId: c.userId, submissionId: id })));
    await recordAudit(tx, c, {
      action: "marking.requested",
      targetType: "assignment",
      targetId: a.id,
      metadata: { scripts: ids.length, single: Boolean(pupilId) },
    });
    return { a, ids };
  });
  if (!picked) throw new MarkingError("Assignment not found.");
  if (picked.ids.length === 0) return { queued: 0 };
  try {
    await enqueueMarking(picked.ids.map((submissionId) => ({ submissionId, requestedBy: c.userId })));
  } catch (err) {
    await withTenant(c, (tx) =>
      tx
        .update(submission)
        .set({ status: "failed", failureReason: "Could not start marking. Try again in a moment.", updatedAt: new Date() })
        .where(and(eq(submission.schoolId, c.schoolId), inArray(submission.id, picked.ids), eq(submission.status, "marking"))),
    );
    throw err;
  }
  return { queued: picked.ids.length };
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

export type ExportData = {
  assignment: AssignmentRow;
  rows: {
    pupilId: string;
    code: string;
    name: string | null;
    state: "approved" | "absent" | "not approved";
    lines: (number | null)[];
    total: number | null;
    feedback: string | null;
    approvedAt: Date | null;
    approvedBy: string | null;
  }[];
};

/** Approved marks and feedback for the markbook. Unapproved marks are never exported. */
export async function exportAssignment(
  ctx: Ctx,
  assignmentId: string,
  kind: "csv" | "feedback_sheets" = "csv",
): Promise<ExportData | null> {
  const c = teacher(ctx);
  return withTenant(c, async (tx) => {
    const a = await loadAssignment(tx, c, assignmentId);
    if (!a) return null;
    const pupils = await tx
      .select({ id: pupil.id, code: pupil.code, enc: pupil.displayNameEnc })
      .from(pupil)
      .where(and(eq(pupil.schoolId, c.schoolId), eq(pupil.classId, a.classId)))
      .orderBy(asc(pupil.code));
    const approved = await tx
      .select({
        pupilId: submission.pupilId,
        absent: submission.absent,
        approvalTotal: approval.finalTotal,
        feedback: approval.finalFeedback,
        approvedAt: approval.approvedAt,
        approvedBy: appUser.displayName,
        markResultId: approval.markResultId,
      })
      .from(submission)
      .leftJoin(approval, and(eq(approval.submissionId, submission.id), isNull(approval.reopenedAt)))
      .leftJoin(appUser, eq(appUser.id, approval.approvedBy))
      .where(and(eq(submission.schoolId, c.schoolId), eq(submission.assignmentId, a.id)));
    const byPupil = new Map(approved.map((r) => [r.pupilId, r]));
    const rows: ExportData["rows"] = [];
    for (const p of pupils) {
      const r = byPupil.get(p.id);
      let lines: (number | null)[] = a.criteria.map(() => null);
      let state: ExportData["rows"][number]["state"] = "not approved";
      if (r?.absent) state = "absent";
      else if (r?.markResultId) {
        state = "approved";
        const ls = await tx
          .select({ position: markLine.position, finalAwarded: markLine.finalAwarded })
          .from(markLine)
          .where(and(eq(markLine.schoolId, c.schoolId), eq(markLine.markResultId, r.markResultId)))
          .orderBy(asc(markLine.position));
        lines = ls.map((l) => l.finalAwarded);
      }
      rows.push({
        pupilId: p.id,
        code: p.code,
        name: decryptName(c, p.enc),
        state,
        lines,
        total: state === "approved" ? (r?.approvalTotal ?? null) : null,
        feedback: state === "approved" ? (r?.feedback ?? null) : null,
        approvedAt: state === "approved" ? (r?.approvedAt ?? null) : null,
        approvedBy: state === "approved" ? (r?.approvedBy ?? null) : null,
      });
    }
    await recordAudit(tx, c, {
      action: kind === "csv" ? "export.csv" : "export.feedback_sheets",
      targetType: "assignment",
      targetId: a.id,
      metadata: { approved: rows.filter((r) => r.state === "approved").length, pupils: rows.length },
    });
    return { assignment: a, rows };
  });
}
