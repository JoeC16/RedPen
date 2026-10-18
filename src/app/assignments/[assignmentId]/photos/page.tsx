import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { PhotoUploader } from "@/components/photo-uploader";
import { linkClass, PageTitle } from "@/components/ui";
import { reviewQueue } from "@/server/dal/marking";
import { requirePageUser } from "@/server/session";

export const metadata: Metadata = { title: "Upload photos" };
export const dynamic = "force-dynamic";

export default async function PhotosPage({ params }: { params: Promise<{ assignmentId: string }> }) {
  const user = await requirePageUser();
  if (user.role !== "teacher") notFound();
  const q = await reviewQueue(user, (await params).assignmentId);
  if (!q) notFound();
  const codes = q.rows.map((r) => r.pupilCode).sort();
  return (
    <AppShell user={user}>
      <p className="mb-2 text-sm"><Link href={`/assignments/${q.assignment.id}`} className={linkClass}>{q.assignment.title}</Link></p>
      <PageTitle description="Photograph each pupil's pages and name each file with the pupil's code. Several pages: add -2, -3 and so on.">
        Upload photos
      </PageTitle>
      <div className="grid gap-8 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <PhotoUploader assignmentId={q.assignment.id} />
        </div>
        <aside aria-labelledby="codes-h" className="text-sm">
          <h2 id="codes-h" className="mb-2 font-medium">Pupil codes in {q.assignment.className}</h2>
          <p className="mb-2 text-gray-600 dark:text-gray-300">Example: {codes[0] ?? "P01"}.jpg, {codes[0] ?? "P01"}-2.jpg</p>
          <ul className="columns-2 font-mono">
            {codes.map((c) => <li key={c}>{c}</li>)}
          </ul>
        </aside>
      </div>
    </AppShell>
  );
}
