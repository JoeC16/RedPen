import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { linkClass, PageTitle } from "@/components/ui";
import { listClasses } from "@/server/dal/classes";
import { listSchools } from "@/server/dal/schools";
import { requirePageUser } from "@/server/session";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const user = await requirePageUser();
  return (
    <AppShell user={user}>
      <PageTitle>Welcome, {user.displayName}</PageTitle>
      {user.role === "authority_admin" ? <AuthorityHome user={user} /> : <SchoolHome user={user} />}
    </AppShell>
  );
}

async function SchoolHome({ user }: { user: Awaited<ReturnType<typeof requirePageUser>> }) {
  const classes = await listClasses(user);
  const pupils = classes.reduce((n, c) => n + c.pupilCount, 0);
  return (
    <div className="space-y-4">
      <p>
        {user.role === "teacher" ? "You teach" : "Your school has"} {classes.length}{" "}
        {classes.length === 1 ? "class" : "classes"} with {pupils} {pupils === 1 ? "pupil" : "pupils"}.
      </p>
      <p className="flex gap-6">
        <Link href="/classes" className={linkClass}>
          View {user.role === "teacher" ? "your classes" : "classes"}
        </Link>
        {user.role === "school_admin" ? (
          <Link href="/dashboard" className={linkClass}>
            Open the school dashboard
          </Link>
        ) : null}
      </p>
    </div>
  );
}

async function AuthorityHome({ user }: { user: Awaited<ReturnType<typeof requirePageUser>> }) {
  const schools = await listSchools(user);
  return (
    <div className="space-y-4">
      <p>
        Your authority has {schools.length} {schools.length === 1 ? "school" : "schools"} on the platform. You see
        aggregate figures only; pupil work and feedback stay with each school.
      </p>
      <p className="flex gap-6">
        <Link href="/dashboard" className={linkClass}>
          Open the dashboard
        </Link>
        <Link href="/schools" className={linkClass}>
          View schools
        </Link>
      </p>
    </div>
  );
}
