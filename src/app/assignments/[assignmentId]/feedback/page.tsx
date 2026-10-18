import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { Empty, linkClass, PageTitle } from "@/components/ui";
import { exportAssignment } from "@/server/dal/marking";
import { ownSchoolName } from "@/server/dal/schools";
import { requirePageUser } from "@/server/session";
import { PrintButton } from "./print-button";

export const metadata: Metadata = { title: "Feedback sheets" };
export const dynamic = "force-dynamic";

const fmt = new Intl.DateTimeFormat("en-GB", { dateStyle: "long", timeZone: "Europe/London" });

/**
 * Per-pupil feedback sheets for approved work, one per printed page. The
 * browser's print dialog saves them as PDF, so no PDF library is needed.
 */
export default async function FeedbackSheetsPage({
  params,
  searchParams,
}: {
  params: Promise<{ assignmentId: string }>;
  searchParams: Promise<{ pupil?: string }>;
}) {
  const user = await requirePageUser();
  if (user.role !== "teacher") notFound();
  const data = await exportAssignment(user, (await params).assignmentId, "feedback_sheets");
  if (!data) notFound();
  const { pupil } = await searchParams;
  const { assignment: a } = data;
  const school = await ownSchoolName(user);
  const sheets = data.rows.filter((r) => r.state === "approved" && (!pupil || r.pupilId === pupil));

  return (
    <AppShell user={user}>
      <div className="print:hidden">
        <p className="mb-2 text-sm"><Link href={`/assignments/${a.id}`} className={linkClass}>{a.title}</Link></p>
        <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
          <PageTitle description="One page per pupil with approved marks. Choose “Save as PDF” in the print dialog to make a PDF.">
            Feedback sheets
          </PageTitle>
          {sheets.length > 0 ? <PrintButton /> : null}
        </div>
        {sheets.length === 0 ? <Empty>No approved marks yet. Sheets appear once you approve a pupil.</Empty> : null}
      </div>
      {sheets.map((s, i) => (
        <article
          key={s.code}
          aria-label={`Feedback sheet for ${s.code}`}
          className={`mb-8 rounded border border-gray-300 p-8 print:mb-0 print:rounded-none print:border-0 print:p-0 dark:border-gray-700 ${i < sheets.length - 1 ? "break-after-page" : ""}`}
        >
          <header className="mb-6 border-b border-gray-300 pb-4 dark:border-gray-700">
            <p className="text-sm text-gray-700 dark:text-gray-300">{school} · {a.className}</p>
            <h2 className="text-xl font-semibold">{a.title}</h2>
            <p className="mt-2">
              <span className="font-mono">{s.code}</span>
              {s.name ? <span> · {s.name}</span> : null}
            </p>
          </header>
          <table className="mb-6 w-full text-left">
            <caption className="sr-only">Marks for {s.code}</caption>
            <thead>
              <tr className="border-b border-gray-300 dark:border-gray-700">
                <th scope="col" className="py-1 font-medium">Question or criterion</th>
                <th scope="col" className="py-1 text-right font-medium">Mark</th>
              </tr>
            </thead>
            <tbody>
              {a.criteria.map((c, j) => (
                <tr key={c.label} className="border-b border-gray-200 dark:border-gray-800">
                  <td className="py-1">{c.label}</td>
                  <td className="py-1 text-right">{s.lines[j] ?? "–"} / {c.max}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <th scope="row" className="py-2 font-semibold">Total</th>
                <td className="py-2 text-right font-semibold">{s.total} / {a.totalMarks}</td>
              </tr>
            </tfoot>
          </table>
          <h3 className="mb-1 font-medium">Feedback</h3>
          <p className="whitespace-pre-wrap">{s.feedback ?? "—"}</p>
          <p className="mt-6 text-sm text-gray-700 dark:text-gray-300">
            Marked and approved by {s.approvedBy}{s.approvedAt ? ` on ${fmt.format(s.approvedAt)}` : ""}.
          </p>
        </article>
      ))}
    </AppShell>
  );
}
