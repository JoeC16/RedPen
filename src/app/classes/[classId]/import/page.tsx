import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { PageTitle } from "@/components/ui";
import { getClass } from "@/server/dal/classes";
import { requirePageUser } from "@/server/session";
import { ImportForm } from "./import-form";

export const metadata: Metadata = { title: "Import pupils" };
export const dynamic = "force-dynamic";

export default async function ImportPage({ params }: { params: Promise<{ classId: string }> }) {
  const user = await requirePageUser();
  if (user.role !== "teacher") notFound();
  const cls = await getClass(user, (await params).classId);
  if (!cls) notFound();
  return (
    <AppShell user={user}>
      <PageTitle description={`${cls.name} · Year ${cls.yearGroup} · ${cls.subject}`}>Import pupils</PageTitle>
      <ImportForm classId={cls.id} />
    </AppShell>
  );
}
