import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { SchemeForm } from "@/components/scheme-form";
import { linkClass, PageTitle } from "@/components/ui";
import { updateAssignmentAction } from "@/app/assignments/actions";
import { getAssignment } from "@/server/dal/assignments";
import { requirePageUser } from "@/server/session";

export const metadata: Metadata = { title: "Edit assignment" };
export const dynamic = "force-dynamic";

export default async function EditAssignmentPage({ params }: { params: Promise<{ assignmentId: string }> }) {
  const user = await requirePageUser();
  if (user.role !== "teacher") notFound();
  const a = await getAssignment(user, (await params).assignmentId);
  if (!a) notFound();
  return (
    <AppShell user={user}>
      <p className="mb-2 text-sm"><Link href={`/assignments/${a.id}`} className={linkClass}>{a.title}</Link></p>
      <PageTitle description={`${a.className} · scheme version ${a.schemeVersion}`}>Edit assignment</PageTitle>
      <SchemeForm
        action={updateAssignmentAction.bind(null, a.id)}
        defaults={{ title: a.title, workType: a.workType, schemeText: a.schemeText, totalMarks: a.totalMarks, criteria: a.criteria }}
        submitLabel="Save changes"
        warnOnSchemeChange
      />
    </AppShell>
  );
}
