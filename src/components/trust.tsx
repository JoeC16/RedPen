import Link from "next/link";
import type { ReactNode } from "react";
import { AppShell } from "@/components/app-shell";
import { linkClass } from "@/components/ui";
import { appName } from "@/config";
import { CLAIMS, type Claim } from "@/content/claims";
import { isMissing, type Fact } from "@/content/org";
import type { SessionUser } from "@/server/session";

/** The trust centre is public: signed-in users get the app around it, everyone else a plain header. */
export function TrustShell({ user, children }: { user: SessionUser | null; children: ReactNode }) {
  if (user) return <AppShell user={user}>{children}</AppShell>;
  return (
    <>
      <header className="border-b border-gray-200 print:hidden dark:border-gray-800">
        <div className="mx-auto flex max-w-6xl items-center gap-6 px-4 py-3">
          <Link href="/trust" className="text-lg font-semibold text-accent dark:text-red-300">
            {appName}
          </Link>
          <span className="text-sm text-gray-700 dark:text-gray-300">Trust centre</span>
          <Link href="/login" className={`ml-auto text-sm ${linkClass}`}>
            Sign in
          </Link>
        </div>
      </header>
      <main id="main" className="mx-auto max-w-6xl px-4 py-8">
        {children}
      </main>
    </>
  );
}

/** A company fact, or a visible placeholder when it is not decided yet. */
export function FactText({ f }: { f: Fact }) {
  if (!isMissing(f)) return <>{f.value}</>;
  return (
    <mark className="rounded bg-amber-100 px-1 text-amber-950 dark:bg-amber-900 dark:text-amber-50">
      [To be confirmed: {f.missing}]
    </mark>
  );
}

/** A blank for the school or authority to fill in when they adopt a document. */
export function Blank({ children }: { children: ReactNode }) {
  return <span className="rounded border border-dashed border-gray-500 px-1">[{children}]</span>;
}

export const confirmedClaims = (topic: Claim["topic"]) => CLAIMS.filter((c) => c.topic === topic && c.status === "confirmed");
export const openClaims = (topic: Claim["topic"]) => CLAIMS.filter((c) => c.topic === topic && c.status === "unconfirmed");

/** Confirmed claims with their sources; open ones are named as still being checked, never asserted. */
export function ClaimList({ topic }: { topic: Claim["topic"] }) {
  const done = confirmedClaims(topic);
  const open = openClaims(topic);
  return (
    <>
      {done.length ? (
        <ul className="list-disc space-y-2 pl-5">
          {done.map((c) => (
            <li key={c.id}>
              {c.statement}
              {c.sources?.length ? (
                <span className="text-sm text-gray-700 dark:text-gray-300">
                  {" "}
                  (Source:{" "}
                  {c.sources.map((s, i) => (
                    <span key={s.url}>
                      {i ? "; " : ""}
                      <a href={s.url} className={linkClass} rel="noopener">
                        {s.title}
                      </a>
                      , checked {s.checked}
                    </span>
                  ))}
                  )
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
      {open.length ? (
        <div className="mt-4 rounded border border-amber-600 p-3 text-sm">
          <p className="font-medium">Still being checked</p>
          <p className="mt-1">We have not yet confirmed the following against the primary source, so we make no claim about them yet:</p>
          <ul className="mt-1 list-disc pl-5">
            {open.map((c) => (
              <li key={c.id}>{c.question}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </>
  );
}

export function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section aria-labelledby={`${id}-h`} className="mb-10 max-w-3xl">
      <h2 id={`${id}-h`} className="mb-3 text-xl font-semibold">
        {title}
      </h2>
      <div className="space-y-3">{children}</div>
    </section>
  );
}
