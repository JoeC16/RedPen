import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { linkClass, Notice, secondaryButtonClass, StatusBadge } from "@/components/ui";
import { setAbsentAction } from "@/app/assignments/actions";
import { listAssignments } from "@/server/dal/assignments";
import { getReview } from "@/server/dal/marking";
import { workTypeLabel } from "@/server/marking/marks";
import { requirePageUser } from "@/server/session";
import { MarksForm } from "./marks-form";
import { MoveForm, ReopenForm, WorkEditor } from "./side-forms";

export const metadata: Metadata = { title: "Review" };
export const dynamic = "force-dynamic";

const fmt = new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/London" });

export default async function ReviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ assignmentId: string; pupilId: string }>;
  searchParams: Promise<{ approved?: string; moved?: string }>;
}) {
  const user = await requirePageUser();
  if (user.role !== "teacher") notFound();
  const { assignmentId, pupilId } = await params;
  const v = await getReview(user, assignmentId, pupilId);
  if (!v) notFound();
  const sp = await searchParams;
  const { assignment: a, pupil: p, submission: s } = v;
  const locked = s?.status === "approved";
  const absent = s?.absent ?? false;
  const others = (await listAssignments(user, a.classId))?.filter((x) => x.id !== a.id).map((x) => ({ id: x.id, title: x.title })) ?? [];
  const status = s?.status ?? "todo";
  const reopened = v.history.filter((h) => h.reopenedAt);

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
      {sp.moved ? <Notice>Work moved to this assignment. Mark it against this scheme.</Notice> : null}

      <div className="grid gap-8 lg:grid-cols-2">
        <section aria-labelledby="work-h">
          <h2 id="work-h" className="mb-3 text-lg font-medium">Pupil work</h2>
          {absent ? (
            <p className="rounded border border-dashed border-gray-400 p-4">Marked absent for this assignment.</p>
          ) : s?.text ? (
            <div className="max-h-[32rem] overflow-y-auto whitespace-pre-wrap rounded border border-gray-200 p-4 dark:border-gray-800">{s.text}</div>
          ) : (
            <p className="rounded border border-dashed border-gray-400 p-4">No typed work yet. You can still mark from paper.</p>
          )}
          {!locked ? (
            <>
              {!absent ? <WorkEditor assignmentId={a.id} pupilId={p.id} text={s?.text ?? ""} open={!s?.text} /> : null}
              <form action={setAbsentAction.bind(null, a.id, p.id)} className="mt-4">
                <input type="hidden" name="absent" value={absent ? "0" : "1"} />
                <button type="submit" className={secondaryButtonClass}>{absent ? "Mark present" : "Mark absent"}</button>
              </form>
              {s ? <MoveForm assignmentId={a.id} pupilId={p.id} targets={others} /> : null}
            </>
          ) : null}
          <details className="mt-6">
            <summary className="cursor-pointer text-sm font-medium">Mark scheme</summary>
            <pre className="mt-2 whitespace-pre-wrap rounded border border-gray-200 p-3 text-sm dark:border-gray-800">{a.schemeText}</pre>
          </details>
        </section>

        <section aria-labelledby="marks-h">
          <h2 id="marks-h" className="mb-3 text-lg font-medium">Marks</h2>
          {locked && v.approval ? (
            <p className="mb-4 rounded border border-green-700 p-3">
              Approved by {v.approval.approvedBy} on {fmt.format(v.approval.approvedAt)}: {v.approval.finalTotal} / {a.totalMarks}. Marks are locked.
            </p>
          ) : (
            <p className="mb-4 text-sm text-gray-700 dark:text-gray-300">Draft. Not final until you approve it.</p>
          )}
          <MarksForm
            key={`${p.id}-${locked ? "locked" : "open"}-${a.schemeVersion}`}
            assignmentId={a.id}
            pupilId={p.id}
            pupilCode={p.code}
            lines={v.lines}
            feedback={s?.feedback ?? ""}
            totalMarks={a.totalMarks}
            locked={locked}
            disabledReason={absent ? "Mark the pupil present to enter marks." : null}
          />
          {locked ? <div className="mt-6"><ReopenForm assignmentId={a.id} pupilId={p.id} /></div> : null}
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
