import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { PageTitle } from "@/components/ui";
import { requirePageUser } from "@/server/session";
import { ClassForm } from "./class-form";

export const metadata: Metadata = { title: "New class" };
export const dynamic = "force-dynamic";

export default async function NewClassPage() {
  const user = await requirePageUser();
  if (user.role === "authority_admin") notFound();
  return (
    <AppShell user={user}>
      <PageTitle description={user.role === "teacher" ? "You will be the class teacher. A school admin can share it with colleagues." : "Assign teachers from the class page once it is created."}>
        New class
      </PageTitle>
      <ClassForm />
    </AppShell>
  );
}
