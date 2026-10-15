import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { SchemeForm, type SchemeDefaults } from "@/components/scheme-form";
import { buttonClass, inputClass, linkClass, PageTitle } from "@/components/ui";
import { createAssignmentAction } from "@/app/assignments/actions";
import { getAssignment, listReusableSchemes } from "@/server/dal/assignments";
import { getClass } from "@/server/dal/classes";
import { requirePageUser } from "@/server/session";

export const metadata: Metadata = { title: "New assignment" };
export const dynamic = "force-dynamic";

export default async function NewAssignmentPage({
  params,
  searchParams,
}: {
  params: Promise<{ classId: string }>;
  searchParams: Promise<{ from?: string }>;
}) {
  const user = await requirePageUser();
  if (user.role !== "teacher") notFound();
  const cls = await getClass(user, (await params).classId);
  if (!cls) notFound();
  const from = (await searchParams).from;
  const [reusable, source] = await Promise.all([listReusableSchemes(user), from ? getAssignment(user, from) : Promise.resolve(null)]);
  const defaults: SchemeDefaults = source
    ? { title: source.title, workType: source.workType, schemeText: source.schemeText, totalMarks: source.totalMarks, criteria: source.criteria }
    : { title: "", workType: "short", schemeText: "", totalMarks: "", criteria: [] };

  return (
    <AppShell user={user}>
      <p className="mb-2 text-sm"><Link href={`/classes/${cls.id}`} className={linkClass}>{cls.name}</Link></p>
      <PageTitle description={`${cls.name} · Year ${cls.yearGroup} · ${cls.subject}`}>New assignment</PageTitle>
      {reusable.length > 0 ? (
        <form method="get" className="mb-8 flex max-w-3xl flex-wrap items-end gap-3 rounded border border-gray-200 p-4 dark:border-gray-800">
          <div className="grow">
            <label htmlFor="from" className="block text-sm font-medium">Start from a saved scheme</label>
            <select id="from" name="from" defaultValue={source?.id ?? ""} className={inputClass}>
              <option value="">Blank</option>
              {reusable.map((r) => <option key={r.id} value={r.id}>{r.title} ({r.className})</option>)}
            </select>
          </div>
          <button type="submit" className={buttonClass}>Use this scheme</button>
        </form>
      ) : null}
      <SchemeForm key={source?.id ?? "blank"} action={createAssignmentAction.bind(null, cls.id)} defaults={defaults} submitLabel="Create assignment" />
    </AppShell>
  );
}
