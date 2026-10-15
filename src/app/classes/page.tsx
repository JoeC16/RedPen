import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { Empty, linkClass, PageTitle, Table, Td } from "@/components/ui";
import { listClasses } from "@/server/dal/classes";
import { requirePageUser } from "@/server/session";

export const metadata: Metadata = { title: "Classes" };
export const dynamic = "force-dynamic";

export default async function ClassesPage() {
  const user = await requirePageUser();
  if (user.role === "authority_admin") notFound();
  const classes = await listClasses(user);
  return (
    <AppShell user={user}>
      <PageTitle>{user.role === "teacher" ? "My classes" : "Classes"}</PageTitle>
      {classes.length === 0 ? (
        <Empty>No classes yet.</Empty>
      ) : (
        <Table caption="Classes" head={["Class", "Year", "Subject", "Pupils"]}>
          {classes.map((c) => (
            <tr key={c.id}>
              <Td>
                <Link href={`/classes/${c.id}`} className={linkClass}>
                  {c.name}
                </Link>
              </Td>
              <Td>Year {c.yearGroup}</Td>
              <Td>{c.subject}</Td>
              <Td>{c.pupilCount}</Td>
            </tr>
          ))}
        </Table>
      )}
    </AppShell>
  );
}
