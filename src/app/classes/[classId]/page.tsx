import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { Empty, PageTitle, Table, Td } from "@/components/ui";
import { getClass, listClassTeachers, listPupils } from "@/server/dal/classes";
import { requirePageUser } from "@/server/session";

export const metadata: Metadata = { title: "Class" };
export const dynamic = "force-dynamic";

export default async function ClassPage({ params }: { params: Promise<{ classId: string }> }) {
  const user = await requirePageUser();
  if (user.role === "authority_admin") notFound();
  const { classId } = await params;
  const cls = await getClass(user, classId);
  if (!cls) notFound();
  const [pupils, teachers] = await Promise.all([listPupils(user, classId), listClassTeachers(user, classId)]);
  const showNames = user.role === "teacher";
  return (
    <AppShell user={user}>
      <PageTitle description={`Year ${cls.yearGroup} · ${cls.subject} · taught by ${teachers?.map((t) => t.displayName).join(", ") || "no one yet"}`}>
        {cls.name}
      </PageTitle>
      <h2 className="mb-3 text-lg font-medium">Pupils</h2>
      {!pupils || pupils.length === 0 ? (
        <Empty>No pupils in this class yet.</Empty>
      ) : (
        <Table caption={`Pupils in ${cls.name}`} head={showNames ? ["Code", "Name"] : ["Code"]}>
          {pupils.map((p) => (
            <tr key={p.id}>
              <Td className="font-mono">{p.code}</Td>
              {showNames ? <Td>{p.displayName ?? <span className="text-gray-600 dark:text-gray-300">Not recorded</span>}</Td> : null}
            </tr>
          ))}
        </Table>
      )}
      {!showNames ? (
        <p className="mt-3 text-sm text-gray-600 dark:text-gray-300">Pupil names are visible to the class teacher only.</p>
      ) : null}
    </AppShell>
  );
}
