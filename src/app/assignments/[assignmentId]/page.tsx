import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { buttonClass, Empty, linkClass, Notice, PageTitle, secondaryButtonClass, StatusBadge, Table, Td } from "@/components/ui";
import { reviewQueue } from "@/server/dal/marking";
import { workTypeLabel } from "@/server/marking/marks";
import { requirePageUser } from "@/server/session";
import { MarkingProgress, RunMarkingButton } from "./marking-controls";

export const metadata: Metadata = { title: "Assignment" };
export const dynamic = "force-dynamic";

export default async function AssignmentPage({
  params,
  searchParams,
}: {
  params: Promise<{ assignmentId: string }>;
  searchParams: Promise<{ added?: string; saved?: string; done?: string }>;
}) {
  const user = await requirePageUser();
  if (user.role === "authority_admin") notFound();
  const isTeacher = user.role === "teacher";
  const q = await reviewQueue(user, (await params).assignmentId);
  if (!q) notFound();
  const { assignment: a, rows } = q;
  const sp = await searchParams;
  const approved = rows.filter((r) => r.status === "approved").length;
  const absent = rows.filter((r) => r.absent).length;
  const next = rows.find((r) => r.status !== "approved" && !r.absent);
  const marking = rows.filter((r) => r.status === "marking").length;
  const toMark = rows.filter((r) => r.hasWork && !r.absent && (r.status === "todo" || r.status === "failed")).length;

  return (
    <AppShell user={user}>
      <p className="mb-2 text-sm"><Link href={`/classes/${a.classId}`} className={linkClass}>{a.className}</Link></p>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <PageTitle description={`${a.className} · ${workTypeLabel[a.workType]} · out of ${a.totalMarks}`}>{a.title}</PageTitle>
        {isTeacher ? (
          <div className="flex flex-wrap items-start gap-2">
            {rows.some((r) => r.hasWork) ? (
              <RunMarkingButton
                assignmentId={a.id}
                label={toMark > 0 ? `Run AI marking (${toMark})` : "Run AI marking"}
                disabledReason={toMark > 0 ? undefined : marking > 0 ? "Marking in progress." : "All typed work has been marked."}
              />
            ) : null}
            {next ? <Link href={`/assignments/${a.id}/pupils/${next.pupilId}`} className={buttonClass}>Mark next pupil</Link> : null}
            <Link href={`/assignments/${a.id}/work`} className={secondaryButtonClass}>Add typed work</Link>
            <Link href={`/assignments/${a.id}/edit`} className={secondaryButtonClass}>Edit assignment</Link>
            <a href={`/api/assignments/${a.id}/export`} className={secondaryButtonClass}>Export approved marks (CSV)</a>
            {approved > 0 ? <Link href={`/assignments/${a.id}/feedback`} className={secondaryButtonClass}>Feedback sheets (PDF)</Link> : null}
          </div>
        ) : null}
      </div>

      {sp.added ? <Notice>Saved work for {sp.added} {sp.added === "1" ? "pupil" : "pupils"}.</Notice> : null}
      {sp.saved === "scheme" ? <Notice>Scheme updated to version {a.schemeVersion}. Draft marks go back to be marked again.</Notice> : null}
      {sp.saved === "details" ? <Notice>Assignment saved.</Notice> : null}
      {sp.done ? <Notice>Everyone with work has been approved.</Notice> : null}

      <MarkingProgress marking={marking} total={marking} />

      <p className="mb-4">
        {approved} of {rows.length} approved{absent ? `, ${absent} absent` : ""}.{" "}
        {isTeacher ? "AI marks are suggestions; nothing reaches a pupil until you approve it. Flagged and low-confidence work is listed first." : "Read-only view. Marking and approval are done by the class teachers; your viewing of pupil work is recorded in the audit log."}
      </p>

      {rows.length === 0 ? (
        <Empty>
          This class has no pupils yet.{isTeacher ? <> <Link href={`/classes/${a.classId}/import`} className={linkClass}>Import pupils</Link>.</> : null}
        </Empty>
      ) : (
        <Table caption="Review queue: work needing attention first" head={isTeacher ? ["Pupil", "Name", "Work", "Status", "AI confidence", "Flags", "Mark"] : ["Pupil", "Work", "Status", "AI confidence", "Flags", "Mark"]}>
          {rows.map((r) => (
            <tr key={r.pupilId}>
              <Td className="font-mono">
                <Link href={`/assignments/${a.id}/pupils/${r.pupilId}`} className={linkClass}>{r.pupilCode}</Link>
              </Td>
              {isTeacher ? <Td>{r.displayName ?? ""}</Td> : null}
              <Td>{r.absent ? "—" : r.hasWork ? "Added" : "None yet"}</Td>
              <Td><StatusBadge status={r.status} absent={r.absent} /></Td>
              <Td>{r.confidence ? r.confidence[0]!.toUpperCase() + r.confidence.slice(1) : ""}</Td>
              <Td>{r.flagCount > 0 ? `${r.flagCount} to check` : ""}</Td>
              <Td>
                {r.total !== null
                  ? `${r.total} / ${a.totalMarks}${r.status === "approved" ? "" : " (draft)"}`
                  : r.aiTotal !== null && r.status === "review"
                    ? `AI: ${r.aiTotal} / ${a.totalMarks} (draft)`
                    : ""}
              </Td>
            </tr>
          ))}
        </Table>
      )}

      <details className="mt-8">
        <summary className="cursor-pointer font-medium">Mark scheme (version {a.schemeVersion})</summary>
        <pre className="mt-3 overflow-x-auto whitespace-pre-wrap rounded border border-gray-200 p-4 text-sm dark:border-gray-800">{a.schemeText}</pre>
        <ul className="mt-3 list-disc pl-5 text-sm">
          {a.criteria.map((c) => <li key={c.label}>{c.label}: {c.max} {c.max === 1 ? "mark" : "marks"}</li>)}
        </ul>
      </details>
    </AppShell>
  );
}
