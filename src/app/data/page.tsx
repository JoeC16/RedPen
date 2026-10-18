import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { linkClass, Notice, PageTitle, Table, Td } from "@/components/ui";
import { getSettings, listDeletionRequests, schoolForDeletion } from "@/server/dal/retention";
import { listSchools } from "@/server/dal/schools";
import { requirePageUser } from "@/server/session";
import { CancelDeletionForm, ConfirmDeletionForm, RequestDeletionForm } from "./forms";

export const metadata: Metadata = { title: "School data" };
export const dynamic = "force-dynamic";

const fmt = new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/London" });
const statusLabel = { open: "Waiting for confirmation", expired: "Lapsed", confirmed: "Deleted", cancelled: "Cancelled" } as const;

export default async function DataPage({ searchParams }: { searchParams: Promise<{ school?: string }> }) {
  const user = await requirePageUser();
  if (user.role === "teacher") notFound();
  const sp = await searchParams;
  const settings = await getSettings(user);

  if (user.role === "authority_admin" && !sp.school) {
    const schools = await listSchools(user);
    return (
      <AppShell user={user}>
        <PageTitle description="Retention and deletion of pupil data, school by school.">School data</PageTitle>
        <p className="mb-4">
          Pupil work is deleted {settings?.retentionDays} days after approval in every school.{" "}
          <Link href="/settings" className={linkClass}>Change the retention period</Link>
        </p>
        <Table caption="Schools" head={["School", ""]}>
          {schools.map((s) => (
            <tr key={s.id}>
              <Td>{s.name}</Td>
              <Td><Link href={`/data?school=${s.id}`} className={linkClass}>Data and deletion</Link></Td>
            </tr>
          ))}
        </Table>
      </AppShell>
    );
  }

  const schoolId = user.role === "authority_admin" ? sp.school! : user.schoolId!;
  const school = await schoolForDeletion(user, schoolId);
  if (!school) notFound();
  const requests = await listDeletionRequests(user, schoolId);
  const open = requests.find((r) => r.status === "open");
  const done = requests.find((r) => r.status === "confirmed");

  return (
    <AppShell user={user}>
      {user.role === "authority_admin" ? (
        <nav aria-label="Breadcrumb" className="mb-2 text-sm">
          <Link href="/data" className={linkClass}>School data</Link> › {school.name}
        </nav>
      ) : null}
      <PageTitle>{school.name}: data and deletion</PageTitle>

      <section aria-labelledby="retention-h" className="mb-10 max-w-3xl">
        <h2 id="retention-h" className="mb-2 text-lg font-medium">Retention</h2>
        <p>
          Your authority deletes pupil work <strong>{settings?.retentionDays} days after approval</strong>: typed work, photos, the AI&apos;s transcription,
          evidence quotes, comments and feedback. Marks, dates and AI-versus-teacher figures are kept, linked only to the pupil code.
          Teachers can also delete one pupil&apos;s work early from the review screen.
        </p>
      </section>

      <section aria-labelledby="delete-h" className="max-w-3xl rounded-lg border border-red-700 p-6">
        <h2 id="delete-h" className="mb-2 text-lg font-medium">Delete everything for this school</h2>
        <p className="mb-2">This permanently deletes every class, pupil (including encrypted names), assignment, piece of work, photo, mark and approval in the school. It cannot be undone.</p>
        <p className="mb-4">It keeps the school, staff accounts and the audit log. Export any marks you need first.</p>
        <p className="mb-6 text-sm text-gray-700 dark:text-gray-300">
          Two different admins are needed: one requests, and another confirms within 24 hours. Either can be a school admin of this school or an authority admin.
        </p>
        {done ? (
          <Notice>
            Deleted on {fmt.format(done.confirmedAt!)}: {done.result?.classes ?? 0} classes, {done.result?.pupils ?? 0} pupils, {done.result?.submissions ?? 0} pieces of work.
          </Notice>
        ) : null}
        {open ? (
          <div className="space-y-4">
            <p role="status" className="rounded border border-amber-600 p-3">
              <strong>Deletion requested</strong> by {open.requestedBy === user.userId ? "you" : open.requestedByName} on {fmt.format(open.requestedAt)}.
              It lapses at {fmt.format(open.expiresAt)} unless another admin confirms.
            </p>
            {open.requestedBy === user.userId ? (
              <p>A different admin must confirm it. You can cancel it.</p>
            ) : (
              <ConfirmDeletionForm schoolId={schoolId} requestId={open.id} schoolName={school.name} />
            )}
            <CancelDeletionForm requestId={open.id} />
          </div>
        ) : (
          <RequestDeletionForm schoolId={schoolId} schoolName={school.name} />
        )}
        {requests.length > 0 ? (
          <div className="mt-8">
            <Table caption="Recent deletion requests" head={["Requested", "By", "Outcome"]}>
              {requests.map((r) => (
                <tr key={r.id}>
                  <Td>{fmt.format(r.requestedAt)}</Td>
                  <Td>{r.requestedByName}</Td>
                  <Td>{statusLabel[r.status]}</Td>
                </tr>
              ))}
            </Table>
          </div>
        ) : null}
      </section>
    </AppShell>
  );
}
