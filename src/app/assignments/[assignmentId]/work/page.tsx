import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { linkClass, PageTitle } from "@/components/ui";
import { reviewQueue } from "@/server/dal/marking";
import { requirePageUser } from "@/server/session";
import { WorkForm } from "./work-form";

export const metadata: Metadata = { title: "Add typed work" };
export const dynamic = "force-dynamic";

export default async function WorkPage({ params }: { params: Promise<{ assignmentId: string }> }) {
  const user = await requirePageUser();
  if (user.role !== "teacher") notFound();
  const q = await reviewQueue(user, (await params).assignmentId);
  if (!q) notFound();
  const rows = [...q.rows]
    .sort((x, y) => x.pupilCode.localeCompare(y.pupilCode))
    .map((r) => ({ pupilId: r.pupilId, code: r.pupilCode, name: r.displayName, locked: r.status === "approved", hasWork: r.hasWork, absent: r.absent }));
  return (
    <AppShell user={user}>
      <p className="mb-2 text-sm"><Link href={`/assignments/${q.assignment.id}`} className={linkClass}>{q.assignment.title}</Link></p>
      <PageTitle description="Paste each pupil's answers. Leave a box empty to skip that pupil. Names are not sent to the AI; avoid pasting them into the work itself.">
        Add typed work
      </PageTitle>
      <WorkForm assignmentId={q.assignment.id} rows={rows} />
    </AppShell>
  );
}
