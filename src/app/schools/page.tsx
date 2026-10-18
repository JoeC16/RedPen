import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { Empty, PageTitle, Table, Td } from "@/components/ui";
import { listSchools } from "@/server/dal/schools";
import { requirePageUser } from "@/server/session";

export const metadata: Metadata = { title: "Schools" };
export const dynamic = "force-dynamic";

export default async function SchoolsPage() {
  const user = await requirePageUser();
  if (user.role !== "authority_admin") notFound();
  const schools = await listSchools(user);
  return (
    <AppShell user={user}>
      <PageTitle>Schools</PageTitle>
      {schools.length === 0 ? (
        <Empty>No schools yet.</Empty>
      ) : (
        <Table caption="Schools in your authority" head={["School", "Active staff accounts"]}>
          {schools.map((s) => (
            <tr key={s.id}>
              <Td>{s.name}</Td>
              <Td>{s.staffCount}</Td>
            </tr>
          ))}
        </Table>
      )}
    </AppShell>
  );
}
