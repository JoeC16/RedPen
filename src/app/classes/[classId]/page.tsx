import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { buttonClass, Empty, linkClass, Notice, PageTitle, secondaryButtonClass, Table, Td } from "@/components/ui";
import { listAssignments } from "@/server/dal/assignments";
import { getClass, listClassTeachers, listPupils, listSchoolTeachers } from "@/server/dal/classes";
import { workTypeLabel } from "@/server/marking/marks";
import { requirePageUser } from "@/server/session";
import { setClassTeacherAction } from "../actions";

export const metadata: Metadata = { title: "Class" };
export const dynamic = "force-dynamic";

export default async function ClassPage({
  params,
  searchParams,
}: {
  params: Promise<{ classId: string }>;
  searchParams: Promise<{ imported?: string }>;
}) {
  const user = await requirePageUser();
  if (user.role === "authority_admin") notFound();
  const { classId } = await params;
  const cls = await getClass(user, classId);
  if (!cls) notFound();
  const isTeacher = user.role === "teacher";
  const [pupils, teachers, assignments, staff] = await Promise.all([
    listPupils(user, classId),
    listClassTeachers(user, classId),
    isTeacher ? listAssignments(user, classId) : Promise.resolve([]),
    isTeacher ? Promise.resolve([]) : listSchoolTeachers(user),
  ]);
  const imported = Number((await searchParams).imported);
  const assignedIds = new Set(teachers?.map((t) => t.id));

  return (
    <AppShell user={user}>
      <p className="mb-2 text-sm">
        <Link href="/classes" className={linkClass}>Classes</Link>
      </p>
      <PageTitle description={`Year ${cls.yearGroup} · ${cls.subject} · taught by ${teachers?.map((t) => t.displayName).join(", ") || "no one yet"}`}>
        {cls.name}
      </PageTitle>
      {imported > 0 ? <Notice>Imported {imported} {imported === 1 ? "pupil" : "pupils"}.</Notice> : null}

      {isTeacher ? (
        <section aria-labelledby="assignments-h" className="mb-10">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <h2 id="assignments-h" className="text-lg font-medium">Assignments</h2>
            <Link href={`/classes/${cls.id}/assignments/new`} className={buttonClass}>New assignment</Link>
          </div>
          {!assignments || assignments.length === 0 ? (
            <Empty>No assignments yet.</Empty>
          ) : (
            <Table caption={`Assignments for ${cls.name}`} head={["Assignment", "Type", "Out of", "Work added", "Approved"]}>
              {assignments.map((a) => (
                <tr key={a.id}>
                  <Td><Link href={`/assignments/${a.id}`} className={linkClass}>{a.title}</Link></Td>
                  <Td>{workTypeLabel[a.workType]}</Td>
                  <Td>{a.totalMarks}</Td>
                  <Td>{a.submitted} of {cls.pupilCount}</Td>
                  <Td>{a.approved} of {cls.pupilCount}</Td>
                </tr>
              ))}
            </Table>
          )}
        </section>
      ) : null}

      <section aria-labelledby="pupils-h" className="mb-10">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h2 id="pupils-h" className="text-lg font-medium">Pupils</h2>
          {isTeacher ? <Link href={`/classes/${cls.id}/import`} className={secondaryButtonClass}>Import pupils</Link> : null}
        </div>
        {!pupils || pupils.length === 0 ? (
          <Empty>No pupils in this class yet.</Empty>
        ) : (
          <Table caption={`Pupils in ${cls.name}`} head={isTeacher ? ["Code", "Name"] : ["Code"]}>
            {pupils.map((p) => (
              <tr key={p.id}>
                <Td className="font-mono">{p.code}</Td>
                {isTeacher ? <Td>{p.displayName ?? <span className="text-gray-600 dark:text-gray-300">Not recorded</span>}</Td> : null}
              </tr>
            ))}
          </Table>
        )}
        {!isTeacher ? (
          <p className="mt-3 text-sm text-gray-600 dark:text-gray-300">Pupil names, work and marks are visible to the class teachers only.</p>
        ) : null}
      </section>

      {!isTeacher ? (
        <section aria-labelledby="teachers-h">
          <h2 id="teachers-h" className="mb-3 text-lg font-medium">Teachers</h2>
          {staff.length === 0 ? (
            <Empty>No teachers in this school yet.</Empty>
          ) : (
            <Table caption={`Teachers who can see ${cls.name}`} head={["Teacher", "Email", "Access"]}>
              {staff.map((t) => {
                const on = assignedIds.has(t.id);
                return (
                  <tr key={t.id}>
                    <Td>{t.displayName}</Td>
                    <Td>{t.email}</Td>
                    <Td>
                      <form action={setClassTeacherAction.bind(null, cls.id)} className="flex items-center gap-3">
                        <input type="hidden" name="userId" value={t.id} />
                        <input type="hidden" name="assign" value={on ? "0" : "1"} />
                        <span>{on ? "Teaches this class" : "No access"}</span>
                        <button type="submit" className={secondaryButtonClass} aria-label={`${on ? "Remove" : "Add"} ${t.displayName} ${on ? "from" : "to"} ${cls.name}`}>
                          {on ? "Remove" : "Add"}
                        </button>
                      </form>
                    </Td>
                  </tr>
                );
              })}
            </Table>
          )}
        </section>
      ) : null}
    </AppShell>
  );
}
