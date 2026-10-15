import Link from "next/link";
import type { ReactNode } from "react";
import { signOut } from "@/auth";
import { appName } from "@/config";
import { getAuthority, ownSchoolName } from "@/server/dal/schools";
import { navFor, roleLabel } from "@/server/roles";
import type { SessionUser } from "@/server/session";

async function signOutAction() {
  "use server";
  await signOut({ redirectTo: "/login" });
}

export async function AppShell({ user, children }: { user: SessionUser; children: ReactNode }) {
  const [authority, schoolName] = await Promise.all([getAuthority(user), ownSchoolName(user)]);
  return (
    <>
      <header className="border-b border-gray-200 dark:border-gray-800">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
          <Link href="/" className="text-lg font-semibold text-accent dark:text-red-300">
            {appName}
          </Link>
          <nav aria-label="Main">
            <ul className="flex flex-wrap gap-4 text-sm">
              {navFor(user.role).map((item) => (
                <li key={item.href}>
                  <Link href={item.href} className="rounded px-1 py-0.5 hover:underline">
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
          <div className="ml-auto flex flex-wrap items-center gap-3 text-sm">
            {authority?.isDemo ? (
              <span className="rounded border border-amber-600 px-2 py-0.5 text-xs font-medium text-amber-800 dark:border-amber-400 dark:text-amber-200">
                Demo data
              </span>
            ) : null}
            <span>
              <span className="font-medium">{user.displayName}</span>
              <span className="text-gray-600 dark:text-gray-300">
                {" "}
                · {roleLabel[user.role]} · {schoolName ?? authority?.name}
              </span>
            </span>
            <form action={signOutAction}>
              <button
                type="submit"
                className="rounded border border-gray-300 px-2 py-1 hover:bg-gray-100 dark:border-gray-700 dark:hover:bg-gray-900"
              >
                Sign out
              </button>
            </form>
          </div>
        </div>
      </header>
      <main id="main" className="mx-auto max-w-6xl px-4 py-8">
        {children}
      </main>
    </>
  );
}
