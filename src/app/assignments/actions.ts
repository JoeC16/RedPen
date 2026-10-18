"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createAssignment, updateAssignment } from "@/server/dal/assignments";
import { deletePhoto } from "@/server/dal/photos";
import { approve, MarkingError, moveWork, reopen, reviewQueue, saveMarks, saveWork, saveWorkBulk, setAbsent, startMarking } from "@/server/dal/marking";
import { schemeSchema } from "@/server/marking/marks";
import { requirePageUser } from "@/server/session";

export type FormState = { error?: string; notice?: string };

function parseScheme(form: FormData) {
  let criteria: unknown = [];
  try {
    criteria = JSON.parse(String(form.get("criteria") ?? "[]"));
  } catch {
    /* reported by validation below */
  }
  return schemeSchema.safeParse({
    title: form.get("title"),
    workType: form.get("workType"),
    schemeText: form.get("schemeText"),
    totalMarks: form.get("totalMarks"),
    criteria,
  });
}

const firstErrors = (issues: { message: string }[]) => [...new Set(issues.map((i) => i.message))].join(" ");

export async function createAssignmentAction(classId: string, _prev: FormState, form: FormData): Promise<FormState> {
  const user = await requirePageUser();
  const parsed = parseScheme(form);
  if (!parsed.success) return { error: firstErrors(parsed.error.issues) };
  const id = await createAssignment(user, classId, parsed.data);
  if (!id) return { error: "Class not found." };
  redirect(`/assignments/${id}`);
}

export async function updateAssignmentAction(assignmentId: string, _prev: FormState, form: FormData): Promise<FormState> {
  const user = await requirePageUser();
  const parsed = parseScheme(form);
  if (!parsed.success) return { error: firstErrors(parsed.error.issues) };
  const res = await updateAssignment(user, assignmentId, parsed.data);
  if (!res) return { error: "Assignment not found." };
  redirect(`/assignments/${assignmentId}?saved=${res.schemeChanged ? "scheme" : "details"}`);
}

/** Run a marking write; turn rule violations into a message for the teacher. */
async function guarded(fn: () => Promise<boolean>): Promise<FormState | null> {
  try {
    return (await fn()) ? null : { error: "Not found." };
  } catch (err) {
    if (err instanceof MarkingError) return { error: err.message };
    throw err;
  }
}

const reviewPath = (a: string, p: string) => `/assignments/${a}/pupils/${p}`;

export async function saveWorkAction(assignmentId: string, pupilId: string, _prev: FormState, form: FormData): Promise<FormState> {
  const user = await requirePageUser();
  const text = String(form.get("text") ?? "").slice(0, 100_000);
  const failed = await guarded(() => saveWork(user, assignmentId, pupilId, text));
  if (failed) return failed;
  revalidatePath(reviewPath(assignmentId, pupilId));
  return { notice: "Work saved." };
}

export async function saveWorkBulkAction(assignmentId: string, _prev: FormState, form: FormData): Promise<FormState> {
  const user = await requirePageUser();
  const entries = [...form.entries()]
    .filter(([k]) => k.startsWith("work:"))
    .map(([k, v]) => ({ pupilId: k.slice(5), text: String(v).slice(0, 100_000) }));
  try {
    const saved = await saveWorkBulk(user, assignmentId, entries);
    revalidatePath(`/assignments/${assignmentId}`);
    redirect(`/assignments/${assignmentId}?added=${saved}`);
  } catch (err) {
    if (err instanceof MarkingError) return { error: err.message };
    throw err; // includes the redirect on success
  }
}

export async function setAbsentAction(assignmentId: string, pupilId: string, form: FormData): Promise<void> {
  const user = await requirePageUser();
  await guarded(() => setAbsent(user, assignmentId, pupilId, form.get("absent") === "1"));
  revalidatePath(reviewPath(assignmentId, pupilId));
}

function parseMarks(form: FormData) {
  const lines: { position: number; finalAwarded: number | null; comment: string | null }[] = [];
  for (const [k, v] of form.entries()) {
    const m = /^mark:(\d+)$/.exec(k);
    if (!m) continue;
    const position = Number(m[1]);
    const raw = String(v).trim();
    const n = raw === "" ? null : Number(raw);
    lines.push({
      position,
      finalAwarded: n === null || Number.isNaN(n) ? null : n,
      comment: String(form.get(`comment:${position}`) ?? ""),
    });
  }
  return { lines, feedback: String(form.get("feedback") ?? "") };
}

async function nextToMark(user: Awaited<ReturnType<typeof requirePageUser>>, assignmentId: string, after: string) {
  const q = await reviewQueue(user, assignmentId);
  const open = q?.rows.filter((r) => r.status !== "approved" && !r.absent && r.pupilId !== after) ?? [];
  return open[0]?.pupilId ?? null;
}

export async function saveMarksAction(assignmentId: string, pupilId: string, _prev: FormState, form: FormData): Promise<FormState> {
  const user = await requirePageUser();
  const input = parseMarks(form);
  const invalid = input.lines.find((l) => l.finalAwarded !== null && l.finalAwarded < 0);
  if (invalid) return { error: "Marks cannot be negative." };
  const failed = await guarded(() => saveMarks(user, assignmentId, pupilId, input));
  if (failed) return failed;
  if (form.get("intent") === "approve") {
    const notApproved = await guarded(() => approve(user, assignmentId, pupilId));
    if (notApproved) {
      revalidatePath(reviewPath(assignmentId, pupilId));
      return { error: `Draft saved, but not approved: ${notApproved.error}` };
    }
    const next = await nextToMark(user, assignmentId, pupilId);
    redirect(next ? `${reviewPath(assignmentId, next)}?approved=${pupilId}` : `/assignments/${assignmentId}?done=1`);
  }
  revalidatePath(reviewPath(assignmentId, pupilId));
  return { notice: "Draft saved. Not yet approved." };
}

export async function reopenAction(assignmentId: string, pupilId: string, _prev: FormState, form: FormData): Promise<FormState> {
  const user = await requirePageUser();
  const failed = await guarded(() => reopen(user, assignmentId, pupilId, String(form.get("reason") ?? "")));
  if (failed) return failed;
  revalidatePath(reviewPath(assignmentId, pupilId));
  return { notice: "Reopened. The marks can be changed and must be approved again." };
}

export async function moveWorkAction(assignmentId: string, pupilId: string, _prev: FormState, form: FormData): Promise<FormState> {
  const user = await requirePageUser();
  const target = String(form.get("target") ?? "");
  const failed = await guarded(() => moveWork(user, assignmentId, pupilId, target));
  if (failed) return failed;
  redirect(reviewPath(target, pupilId) + "?moved=1");
}

/** Send the class (or one pupil, when pupilId is given) for AI marking as background jobs. */
export async function startMarkingAction(assignmentId: string, pupilId: string | null, _prev: FormState, _form: FormData): Promise<FormState> {
  const user = await requirePageUser();
  try {
    const { queued } = await startMarking(user, assignmentId, pupilId ?? undefined);
    revalidatePath(`/assignments/${assignmentId}`);
    if (pupilId) revalidatePath(reviewPath(assignmentId, pupilId));
    if (queued === 0) return { notice: pupilId ? "Nothing to mark: add typed work first." : "Nothing new to mark. Pupils need typed work, and absent or approved pupils are skipped." };
    return { notice: `Marking ${queued} ${queued === 1 ? "script" : "scripts"}. You can leave this page; progress is saved.` };
  } catch (err) {
    if (err instanceof MarkingError) return { error: err.message };
    console.error(JSON.stringify({ event: "start_marking_failed", name: (err as Error).name }));
    return { error: "Could not start marking. Try again in a moment." };
  }
}

export async function deletePhotoAction(fileId: string, assignmentId: string, pupilId: string): Promise<void> {
  const user = await requirePageUser();
  await guarded(() => deletePhoto(user, fileId));
  revalidatePath(reviewPath(assignmentId, pupilId));
}
