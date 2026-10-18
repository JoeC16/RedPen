import { and, eq, sql } from "drizzle-orm";
import { decryptText } from "../crypto";
import { loadAssignment } from "../dal/assignments";
import { markLine, markResult, submission } from "../db/schema";
import { env } from "../env";
import { withTenant, type Ctx } from "../tenancy";
import { ctxForUserId } from "../user-context";
import { getProvider } from "./config";
import type { MarkingProvider } from "./provider";
import { ProviderError } from "./provider";
import { propose } from "./propose";
import { redactNames } from "./redact";

export type MarkJob = { submissionId: string; requestedBy: string; jobId: string };
export type JobOutcome = "marked" | "skipped" | "failed" | "retry";

/** Operational log line. Ids and numbers only; never pupil work, names or marks text. */
function log(fields: Record<string, unknown>) {
  console.info(JSON.stringify({ event: "marking", ...fields }));
}

async function setFailed(ctx: Ctx & { schoolId: string }, submissionId: string, reason: string) {
  await withTenant(ctx, (tx) =>
    tx
      .update(submission)
      .set({ status: "failed", failureReason: reason.slice(0, 500), updatedAt: new Date() })
      .where(and(eq(submission.schoolId, ctx.schoolId), eq(submission.id, submissionId), eq(submission.status, "marking"))),
  );
}

/**
 * Mark one submission. Runs as the teacher who asked, so row-level security
 * applies to the worker too. Idempotent: a retried job that already wrote a
 * run, or a submission no longer waiting for marking, is skipped. Throws only
 * for a retryable failure on a non-final attempt (the queue retries it).
 */
export async function runMarkingJob(
  job: MarkJob,
  opts: { finalAttempt: boolean; provider?: MarkingProvider } = { finalAttempt: true },
): Promise<JobOutcome> {
  const user = await ctxForUserId(job.requestedBy);
  if (!user || user.role !== "teacher" || !user.schoolId) {
    log({ submissionId: job.submissionId, outcome: "skipped", why: "requester no longer active" });
    return "skipped";
  }
  const ctx = { ...user, schoolId: user.schoolId };

  const loaded = await withTenant(ctx, async (tx) => {
    const [s] = await tx
      .select()
      .from(submission)
      .where(and(eq(submission.schoolId, ctx.schoolId), eq(submission.id, job.submissionId)));
    if (!s || s.status !== "marking") return null;
    const [done] = await tx.select({ id: markResult.id }).from(markResult).where(eq(markResult.jobId, job.jobId));
    if (done) return null;
    const a = await loadAssignment(tx, ctx, s.assignmentId);
    if (!a) return null;
    const names = await tx.execute<{ kind: string; value: string }>(sql`select kind, value from app_school_name_list()`);
    return { s, a, names };
  });
  if (!loaded) {
    log({ submissionId: job.submissionId, outcome: "skipped" });
    return "skipped";
  }
  const { s, a } = loaded;
  const original = s.text ?? "";
  if (!original.trim()) {
    await setFailed(ctx, s.id, "There is no typed work to mark. Add the pupil's work, or mark from paper.");
    return "failed";
  }

  // Names never reach the model.
  const key = env().PUPIL_NAME_KEY;
  const nameList = loaded.names.map((n) => (n.kind === "pupil_enc" ? decryptText(n.value, key) : n.value));
  const redacted = redactNames(original, nameList);

  const provider = opts.provider ?? getProvider();
  let proposal;
  try {
    proposal = await propose(
      provider,
      { workType: a.workType, schemeText: a.schemeText, totalMarks: a.totalMarks, criteria: a.criteria, pupilText: redacted.text },
      a.criteria,
      original,
    );
  } catch (err) {
    const pe = err instanceof ProviderError ? err : new ProviderError("Marking failed unexpectedly.", true);
    log({ submissionId: s.id, outcome: pe.retryable && !opts.finalAttempt ? "retry" : "failed", retryable: pe.retryable });
    if (pe.retryable && !opts.finalAttempt) throw pe;
    await setFailed(ctx, s.id, pe.message);
    return "failed";
  }

  const outcome = await withTenant(ctx, async (tx) => {
    const [current] = await tx
      .select({ status: submission.status })
      .from(submission)
      .where(and(eq(submission.schoolId, ctx.schoolId), eq(submission.id, s.id)))
      .for("update");
    if (current?.status !== "marking") return "skipped" as const; // e.g. the teacher marked it by hand meanwhile
    const [last] = await tx
      .select({ n: sql<number>`coalesce(max(${markResult.runNumber}), 0)::int` })
      .from(markResult)
      .where(eq(markResult.submissionId, s.id));
    const runId = crypto.randomUUID();
    await tx.insert(markResult).values({
      id: runId,
      submissionId: s.id,
      classId: s.classId,
      schoolId: ctx.schoolId,
      assignmentId: a.id,
      schemeVersion: a.schemeVersion,
      runNumber: (last?.n ?? 0) + 1,
      source: "ai",
      model: proposal.meta.model,
      promptVersion: proposal.meta.promptVersion,
      confidence: proposal.confidence,
      flags: proposal.flags,
      transcription: proposal.transcription || null,
      feedbackDraft: proposal.feedback || null,
      tokensIn: proposal.meta.tokensIn,
      tokensOut: proposal.meta.tokensOut,
      cacheReadTokens: proposal.meta.cacheReadTokens,
      latencyMs: proposal.meta.latencyMs,
      createdBy: ctx.userId,
      jobId: job.jobId,
    });
    await tx.insert(markLine).values(
      proposal.lines.map((l, i) => ({
        markResultId: runId,
        classId: s.classId,
        schoolId: ctx.schoolId,
        position: i,
        label: l.label,
        max: l.max,
        // A placeholder proposes nothing, so the teacher starts from blank boxes.
        aiAwarded: proposal.meta.placeholder ? null : l.awarded,
        finalAwarded: null, // the teacher decides
        evidence: l.evidence || null,
        aiComment: l.comment || null,
      })),
    );
    await tx
      .update(submission)
      .set({ status: "review", failureReason: null, updatedAt: new Date() })
      .where(and(eq(submission.schoolId, ctx.schoolId), eq(submission.id, s.id)));
    return "marked" as const;
  });
  log({
    submissionId: s.id,
    outcome,
    provider: provider.name,
    model: proposal.meta.model,
    promptVersion: proposal.meta.promptVersion,
    latencyMs: proposal.meta.latencyMs,
    tokensIn: proposal.meta.tokensIn,
    tokensOut: proposal.meta.tokensOut,
    attempts: proposal.attempts,
    namesRedacted: redacted.count,
  });
  return outcome;
}
