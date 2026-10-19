import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { ErrorBox, linkClass, Notice, secondaryButtonClass, StatusBadge } from "@/components/ui";
import { MarkingProgress, RunMarkingButton } from "../../marking-controls";
import { deletePhotoAction, setAbsentAction } from "@/app/assignments/actions";
import { PhotoUploader } from "@/components/photo-uploader";
import { listAssignments } from "@/server/dal/assignments";
import { getReview } from "@/server/dal/marking";
import { workTypeLabel } from "@/server/marking/marks";
import { requirePageUser } from "@/server/session";
import { MarksForm } from "./marks-form";
import { DeleteWorkForm, MoveForm, ReopenForm, WorkEditor } from "./side-forms";

export const metadata: Metadata = { title: "Review" };
export const dynamic = "force-dynamic";

const fmt = new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/London" });

export default async function ReviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ assignmentId: string; pupilId: string }>;
  searchParams: Promise<{ approved?: string; moved?: string; deleted?: string }>;
}) {
  const user = await requirePageUser();
  if (user.role === "authority_admin") notFound();
  const readOnly = user.role !== "teacher";
  const { assignmentId, pupilId } = await params;
  const v = await getReview(user, assignmentId, pupilId);
  if (!v) notFound();
  const sp = await searchParams;
  const { assignment: a, pupil: p, submission: s } = v;
  const locked = s?.status === "approved";
  const absent = s?.absent ?? false;
  const others = readOnly ? [] : (await listAssignments(user, a.classId))?.filter((x) => x.id !== a.id).map((x) => ({ id: x.id, title: x.title })) ?? [];
  const status = s?.status ?? "todo";
  const reopened = v.history.filter((h) => h.reopenedAt);
  const deletedAt = s?.contentDeletedAt ?? null;
  // The AI read a different set of photos from the ones there now.
  const photosChanged =
    v.run?.source === "ai" &&
    (v.run.inputFileIds.length !== v.photos.length || v.photos.some((ph) => !v.run!.inputFileIds.includes(ph.id)));

  return (
    <AppShell user={user}>
      <nav aria-label="Breadcrumb" className="mb-2 text-sm">
        <Link href={`/classes/${a.classId}`} className={linkClass}>{a.className}</Link> ›{" "}
        <Link href={`/assignments/${a.id}`} className={linkClass}>{a.title}</Link>
      </nav>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            <span className="font-mono">{p.code}</span>
            {p.displayName ? <span className="font-normal"> · {p.displayName}</span> : null}
          </h1>
          <p className="mt-1 flex flex-wrap items-center gap-2 text-gray-600 dark:text-gray-300">
            <StatusBadge status={status} absent={absent} />
            <span>{workTypeLabel[a.workType]} · out of {a.totalMarks}</span>
          </p>
        </div>
        <nav aria-label="Pupils in this assignment" className="flex gap-2">
          {v.prevPupilId ? <Link href={`/assignments/${a.id}/pupils/${v.prevPupilId}`} className={secondaryButtonClass}>Previous pupil</Link> : null}
          {v.nextPupilId ? <Link href={`/assignments/${a.id}/pupils/${v.nextPupilId}`} className={secondaryButtonClass}>Next pupil</Link> : null}
        </nav>
      </div>

      {sp.approved ? <Notice>Approved. This is the next pupil to mark.</Notice> : null}
      {status === "marking" ? <MarkingProgress marking={1} total={1} /> : null}
      {status === "failed" && s?.failureReason ? (
        <ErrorBox>
          <p>AI marking failed: {s.failureReason}</p>
          {!readOnly ? <div className="mt-2"><RunMarkingButton assignmentId={a.id} pupilId={p.id} label="Try AI marking again" secondary /></div> : null}
        </ErrorBox>
      ) : null}
      {sp.moved ? <Notice>Work moved to this assignment. Mark it against this scheme.</Notice> : null}
      {sp.deleted === "all" ? <Notice>The work was deleted.</Notice> : null}
      {deletedAt ? (
        <p role="note" className="mb-4 rounded border border-gray-500 p-3">
          {sp.deleted === "content" ? "Deleted. " : ""}
          The pupil&apos;s work, photos and feedback were deleted on {fmt.format(deletedAt)}. The approved marks are kept for the markbook.
        </p>
      ) : null}

      {v.photos.length > 0 ? (
        <section aria-labelledby="photos-h" className="mb-8">
          <h2 id="photos-h" className="mb-3 text-lg font-medium">Photos and transcription</h2>
          <div className="grid gap-6 lg:grid-cols-2">
            <div className="space-y-4">
              {v.photos.map((ph) => (
                <figure key={ph.id} className="rounded border border-gray-200 p-2 dark:border-gray-800">
                  {/* A plain <img>: the URL is private, signed and short-lived, so no image optimiser. */}
                  <img src={ph.url} alt={`Page ${ph.position} of ${p.code}'s work`} className="max-h-[36rem] w-full object-contain" />
                  <figcaption className="mt-2 flex flex-wrap items-center justify-between gap-2 text-sm">
                    <span>
                      Page {ph.position}
                      {ph.originalName ? <span className="text-gray-600 dark:text-gray-300"> · {ph.originalName}</span> : null}
                    </span>
                    <span className="flex gap-3">
                      <a href={ph.url} target="_blank" rel="noopener" className={linkClass}>Open full size</a>
                      {!locked && !readOnly ? (
                        <form action={deletePhotoAction.bind(null, ph.id, a.id, p.id)}>
                          <button type="submit" className={linkClass} aria-label={`Remove page ${ph.position}`}>Remove</button>
                        </form>
                      ) : null}
                    </span>
                  </figcaption>
                </figure>
              ))}
            </div>
            <div>
              <h3 className="mb-2 font-medium">AI transcription</h3>
              {photosChanged && !locked ? (
                <p role="note" className="mb-2 rounded border border-amber-600 p-2 text-sm">
                  The photos have changed since the AI read them, so this transcription and the suggested marks may be out of date. Use “Mark again with AI” to update them.
                </p>
              ) : null}
              {v.run?.transcription ? (
                <>
                  <p className="mb-2 text-sm text-gray-700 dark:text-gray-300">
                    Typed out by the AI from the photos, and marked from this text. Compare it with the photos: a misread here means a wrong mark.
                  </p>
                  <pre className="whitespace-pre-wrap rounded border border-gray-200 p-4 font-mono text-sm dark:border-gray-800">{v.run.transcription}</pre>
                </>
              ) : (
                <p className="rounded border border-dashed border-gray-400 p-4 text-sm">
                  {status === "marking" ? "The AI is reading the photos now." : "Appears here after AI marking."}
                </p>
              )}
            </div>
          </div>
        </section>
      ) : null}

      <div className="grid gap-8 lg:grid-cols-2">
        <section aria-labelledby="work-h">
          <h2 id="work-h" className="mb-3 text-lg font-medium">Pupil work</h2>
          {absent ? (
            <p className="rounded border border-dashed border-gray-400 p-4">Marked absent for this assignment.</p>
          ) : deletedAt ? (
            <p className="rounded border border-dashed border-gray-400 p-4">Deleted on {fmt.format(deletedAt)}.</p>
          ) : s?.text ? (
            <div className="max-h-[32rem] overflow-y-auto whitespace-pre-wrap rounded border border-gray-200 p-4 dark:border-gray-800">{s.text}</div>
          ) : v.photos.length > 0 ? (
            <p className="rounded border border-dashed border-gray-400 p-4">The work is in the photos above.</p>
          ) : (
            <p className="rounded border border-dashed border-gray-400 p-4">No typed work or photos yet. You can still mark from paper.</p>
          )}
          {!locked && !readOnly ? (
            <>
              {!absent ? <WorkEditor assignmentId={a.id} pupilId={p.id} text={s?.text ?? ""} open={!s?.text && v.photos.length === 0} /> : null}
              {!absent ? (
                <details className="mt-3">
                  <summary className="cursor-pointer text-sm font-medium">{v.photos.length ? "Add more photos" : "Add photos"}</summary>
                  <div className="mt-2">
                    <PhotoUploader assignmentId={a.id} pupilId={p.id} pupilCode={p.code} />
                  </div>
                </details>
              ) : null}
              <form action={setAbsentAction.bind(null, a.id, p.id)} className="mt-4">
                <input type="hidden" name="absent" value={absent ? "0" : "1"} />
                <button type="submit" className={secondaryButtonClass}>{absent ? "Mark present" : "Mark absent"}</button>
              </form>
              {(s?.text || v.photos.length > 0) && !absent && status !== "marking" && status !== "failed" ? (
                <div className="mt-4">
                  <RunMarkingButton
                    assignmentId={a.id}
                    pupilId={p.id}
                    secondary
                    label={v.run?.source === "ai" ? "Mark again with AI" : "Mark with AI"}
                  />
                  {v.run ? <p className="mt-1 text-xs text-gray-600 dark:text-gray-300">A new AI suggestion replaces the current draft. Earlier marks are kept in the history.</p> : null}
                </div>
              ) : null}
              {s ? <MoveForm assignmentId={a.id} pupilId={p.id} targets={others} /> : null}
            </>
          ) : null}
          {!readOnly && s && !deletedAt && (s.text || v.photos.length > 0 || v.run) ? (
            <DeleteWorkForm assignmentId={a.id} pupilId={p.id} approved={locked} />
          ) : null}
          {locked && !deletedAt && s?.deleteAfter ? (
            <p className="mt-3 text-sm text-gray-700 dark:text-gray-300">
              Under your authority&apos;s retention policy the work, photos and feedback will be deleted on {fmt.format(s.deleteAfter)}. The marks are kept.
            </p>
          ) : null}
          <details className="mt-6">
            <summary className="cursor-pointer text-sm font-medium">Mark scheme</summary>
            <pre className="mt-2 whitespace-pre-wrap rounded border border-gray-200 p-3 text-sm dark:border-gray-800">{a.schemeText}</pre>
          </details>
        </section>

        <section aria-labelledby="marks-h">
          <h2 id="marks-h" className="mb-3 text-lg font-medium">Marks</h2>
          {v.run?.source === "ai" && !locked ? (
            <section aria-label="AI suggestion" className="mb-4 rounded border border-blue-700 p-3 text-sm">
              <p>
                <strong>AI suggestion. Check every mark before approving.</strong> Confidence:{" "}
                <strong>{v.run.confidence ? v.run.confidence[0]!.toUpperCase() + v.run.confidence.slice(1) : "not given"}</strong>.
              </p>
              {v.run.flags.length > 0 ? (
                <>
                  <p className="mt-2 font-medium">{v.run.flags.length === 1 ? "Check this point:" : `Check these ${v.run.flags.length} points:`}</p>
                  <ul className="mt-1 list-disc pl-5">
                    {v.run.flags.map((f) => <li key={f}>{f}</li>)}
                  </ul>
                </>
              ) : null}
            </section>
          ) : null}
          {locked && v.approval ? (
            <p className="mb-4 rounded border border-green-700 p-3">
              Approved by {v.approval.approvedBy} on {fmt.format(v.approval.approvedAt)}: {v.approval.finalTotal} / {a.totalMarks}. Marks are locked.
            </p>
          ) : (
            <p className="mb-4 text-sm text-gray-700 dark:text-gray-300">
              {readOnly ? "Draft. Not final until a class teacher approves it." : "Draft. Not final until you approve it."}
            </p>
          )}
          <MarksForm
            key={`${p.id}-${locked ? "locked" : "open"}-${a.schemeVersion}`}
            assignmentId={a.id}
            pupilId={p.id}
            pupilCode={p.code}
            lines={v.lines}
            feedback={s?.feedback ?? v.run?.feedbackDraft ?? ""}
            feedbackFromAi={!s?.feedback && Boolean(v.run?.feedbackDraft)}
            totalMarks={a.totalMarks}
            locked={locked || readOnly}
            disabledReason={readOnly ? "Read-only view. Marks are entered and approved by the class teachers." : absent ? "Mark the pupil present to enter marks." : null}
          />
          {locked && !readOnly && !deletedAt ? (
            <div className="mt-6 space-y-4">
              <p>
                <Link href={`/assignments/${a.id}/feedback?pupil=${p.id}`} className={linkClass}>Feedback sheet for {p.code} (PDF)</Link>
              </p>
              <ReopenForm assignmentId={a.id} pupilId={p.id} />
            </div>
          ) : null}
          {reopened.length > 0 ? (
            <section aria-labelledby="history-h" className="mt-6 text-sm">
              <h3 id="history-h" className="font-medium">Earlier approvals</h3>
              <ul className="mt-1 list-disc pl-5">
                {reopened.map((h) => (
                  <li key={h.approvedAt.toISOString()}>
                    {h.finalTotal} / {a.totalMarks}, approved {fmt.format(h.approvedAt)}, reopened {fmt.format(h.reopenedAt!)}: {h.reopenReason}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </section>
      </div>
    </AppShell>
  );
}
