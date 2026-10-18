import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { Empty, linkClass, PageTitle, Table, Td } from "@/components/ui";
import { AUDIT_PAGE_SIZE, auditFilterSchema, searchAudit } from "@/server/dal/audit-log";
import { requirePageUser } from "@/server/session";

export const metadata: Metadata = { title: "Audit log" };
export const dynamic = "force-dynamic";

const input =
  "mt-1 block w-full rounded border border-gray-400 bg-white px-2 py-1.5 text-gray-900 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100";

/** Short, readable metadata: counts, reasons and settings; ids are left out. */
function details(m: Record<string, unknown>): string {
  return Object.entries(m)
    .filter(([k, v]) => v !== null && v !== undefined && !/(^id$|Id$|^requestedBy$)/.test(k))
    .map(([k, v]) => `${k}: ${typeof v === "object" ? JSON.stringify(v) : String(v)}`)
    .join(", ");
}

const ACTION_PREFIXES = ["auth.", "class.", "pupils.", "assignment.", "submission.", "marking.", "photo.", "export.", "retention.", "settings.", "school."];

const fmt = new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "medium", timeZone: "Europe/London" });

export default async function AuditPage({ searchParams }: { searchParams: Promise<Record<string, string | string[]>> }) {
  const user = await requirePageUser();
  if (user.role === "teacher") notFound();
  const raw = Object.fromEntries(
    Object.entries(await searchParams)
      .map(([k, v]) => [k, Array.isArray(v) ? v[0] : v])
      .filter(([, v]) => v !== ""),
  );
  const parsed = auditFilterSchema.safeParse(raw);
  const filter = parsed.success ? parsed.data : {};
  const events = await searchAudit(user, filter);
  const last = events.at(-1);
  const olderHref =
    events.length === AUDIT_PAGE_SIZE && last
      ? `/audit?${new URLSearchParams({ ...(raw as Record<string, string>), before: String(last.id) })}`
      : null;

  return (
    <AppShell user={user}>
      <PageTitle description={user.role === "authority_admin" ? "All schools in your authority." : "Your school only."}>
        Audit log
      </PageTitle>
      <form method="get" className="mb-6 grid gap-4 sm:grid-cols-5" role="search" aria-label="Filter audit log">
        <div className="sm:col-span-2">
          <label htmlFor="actor" className="block text-sm font-medium">
            Actor (name or email)
          </label>
          <input id="actor" name="actor" defaultValue={filter.actor ?? ""} className={input} />
        </div>
        <div>
          <label htmlFor="action" className="block text-sm font-medium">
            Action starts with
          </label>
          <input id="action" name="action" placeholder="auth." list="action-prefixes" defaultValue={filter.action ?? ""} className={input} />
          <datalist id="action-prefixes">
            {ACTION_PREFIXES.map((a) => <option key={a} value={a} />)}
          </datalist>
        </div>
        <div>
          <label htmlFor="from" className="block text-sm font-medium">
            From
          </label>
          <input id="from" name="from" type="date" defaultValue={filter.from ?? ""} className={input} />
        </div>
        <div>
          <label htmlFor="to" className="block text-sm font-medium">
            To
          </label>
          <input id="to" name="to" type="date" defaultValue={filter.to ?? ""} className={input} />
        </div>
        <div className="flex gap-3 sm:col-span-5">
          <button type="submit" className="rounded bg-accent px-4 py-1.5 font-medium text-white hover:bg-accent-strong">
            Search
          </button>
          <Link href="/audit" className={`${linkClass} self-center`}>
            Clear
          </Link>
        </div>
        {!parsed.success ? (
          <p role="alert" className="text-sm text-red-800 dark:text-red-200 sm:col-span-5">
            Some filters were not valid and were ignored.
          </p>
        ) : null}
      </form>

      {events.length === 0 ? (
        <Empty>No events match.</Empty>
      ) : (
        <Table caption="Audit events, newest first" head={["When (UK time)", "Action", "Actor", "School", "Target", "Details"]}>
          {events.map((e) => (
            <tr key={e.id}>
              <Td className="whitespace-nowrap">{fmt.format(e.createdAt)}</Td>
              <Td className="font-mono">{e.action}</Td>
              <Td>
                {e.actorName ? (
                  `${e.actorName} (${e.actorEmail})`
                ) : (
                  <span className="text-gray-600 dark:text-gray-300">{e.action === "retention.deleted" ? "Automatic (retention job)" : "Unknown"}</span>
                )}
              </Td>
              <Td>{e.schoolName ?? "Authority"}</Td>
              <Td>{e.targetName ?? (e.targetType ? <span className="font-mono text-xs">{`${e.targetType}:${e.targetId}`}</span> : "")}</Td>
              <Td className="max-w-xs break-words text-xs">{details(e.metadata)}</Td>
            </tr>
          ))}
        </Table>
      )}
      {olderHref ? (
        <p className="mt-4">
          <Link href={olderHref} className={linkClass}>
            Older events
          </Link>
        </p>
      ) : null}
    </AppShell>
  );
}
