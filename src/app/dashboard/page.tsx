import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { AppShell } from "@/components/app-shell";
import { linkClass, PageTitle, Table, Td } from "@/components/ui";
import { getDashboard, PERIODS, type Period, type WeekPoint } from "@/server/dal/oversight";
import { workTypeLabel } from "@/server/marking/marks";
import { MIN_GROUP, WORK_TYPES, type Cell, type Figures } from "@/server/oversight/figures";
import { requirePageUser } from "@/server/session";

export const metadata: Metadata = { title: "Dashboard" };
export const dynamic = "force-dynamic";

const periodLabel: Record<Period, string> = { "6w": "Last 6 weeks", "13w": "Last 13 weeks (a term)", "52w": "Last 52 weeks" };
const day = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "Europe/London" });

/** A figure, or why it is not shown. Never colour alone. */
function show(c: Cell, format: (n: number) => string): ReactNode {
  if (c === null) return <span aria-label="No data">–</span>;
  if (c === "small")
    return (
      <abbr title={`Hidden: based on fewer than ${MIN_GROUP} pupils or scripts`} className="cursor-help text-gray-700 no-underline dark:text-gray-300">
        fewer than {MIN_GROUP}
      </abbr>
    );
  return format(c);
}

const n = (v: number) => v.toLocaleString("en-GB");
const pct = (v: number) => `${Math.round(v * 100)}%`;
const hours = (v: number) => (v < 48 ? `${v.toFixed(v < 10 ? 1 : 0)} hours` : `${(v / 24).toFixed(1)} days`);
const timeSaved = (m: number) => (m < 120 ? `${Math.round(m)} min` : `${(m / 60).toFixed(m < 600 ? 1 : 0)} hours`);
const usd = (v: number) => `$${v.toFixed(v < 0.1 ? 3 : 2)}`;

function Stat({ label, value, note }: { label: string; value: ReactNode; note?: string }) {
  return (
    <div className="rounded-lg border border-gray-200 p-4 dark:border-gray-800">
      <dt className="text-sm text-gray-700 dark:text-gray-300">{label}</dt>
      <dd className="mt-1 text-2xl font-semibold">{value}</dd>
      {note ? <dd className="mt-1 text-xs text-gray-600 dark:text-gray-300">{note}</dd> : null}
    </div>
  );
}

function Headline({ f, priced }: { f: Figures; priced: boolean }) {
  return (
    <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <Stat label="Scripts added" value={show(f.scripts, n)} />
      <Stat label="Pupils marked" value={show(f.pupilsMarked, n)} note={`Assignments marked: ${f.assignmentsMarked === "small" ? `fewer than ${MIN_GROUP}` : f.assignmentsMarked ?? 0}`} />
      <Stat label="Share approved" value={show(f.shareApproved, pct)} note="Approved by a teacher, of scripts added" />
      <Stat label="Median time, upload to approval" value={show(f.medianHoursToApproval, hours)} />
      <Stat label="Flagged by the AI" value={show(f.flaggedRate, pct)} note="Of AI-marked scripts, with something for the teacher to check" />
      <Stat label="Agreement: within 1 mark" value={show(f.withinOneRate, pct)} note="Teacher's approved total within 1 mark of the AI's" />
      <Stat label="Kept unchanged" value={show(f.keptUnchangedRate, pct)} note="Teacher approved every AI mark as it was" />
      <Stat label="Estimated teacher time saved" value={show(f.timeSavedMinutes, timeSaved)} note="See the assumption below" />
      {priced ? <Stat label="Estimated AI cost per script" value={show(f.costPerScriptUsd, usd)} note="From token counts and the configured prices" /> : null}
    </dl>
  );
}

function Weekly({ weeks, caption }: { weeks: WeekPoint[]; caption: string }) {
  const max = Math.max(1, ...weeks.map((w) => w.activeTeachers));
  return (
    <Table caption={caption} head={["Week starting", "Active teachers", "Approvals"]}>
      {weeks.map((w) => (
        <tr key={w.week}>
          <Td className="whitespace-nowrap">{day.format(new Date(w.week))}</Td>
          <Td>
            <span className="flex items-center gap-2">
              <span className="w-6 text-right tabular-nums">{w.activeTeachers}</span>
              <span aria-hidden="true" className="inline-block h-2 rounded bg-accent" style={{ width: `${(w.activeTeachers / max) * 8}rem` }} />
            </span>
          </Td>
          <Td>{show(w.approvals, n)}</Td>
        </tr>
      ))}
    </Table>
  );
}

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ period?: string; school?: string }> }) {
  const user = await requirePageUser();
  if (user.role === "teacher") notFound();
  const sp = await searchParams;
  const period: Period = sp.period && sp.period in PERIODS ? (sp.period as Period) : "6w";
  const d = await getDashboard(user, { period, schoolId: user.role === "authority_admin" ? sp.school : undefined });
  if (!d) notFound();
  const single = d.scope === "school" ? d.schools[0]! : null;
  const qs = (extra: Record<string, string>) => `/dashboard?${new URLSearchParams({ period, ...extra })}`;

  return (
    <AppShell user={user}>
      {single && user.role === "authority_admin" ? (
        <nav aria-label="Breadcrumb" className="mb-2 text-sm">
          <Link href={qs({})} className={linkClass}>All schools</Link> › {single.name}
        </nav>
      ) : null}
      <PageTitle
        description={
          <>
            Aggregate figures only: no pupil work, names or marks. Figures from fewer than {MIN_GROUP} pupils or scripts are hidden.
          </>
        }
      >
        {single ? `${single.name} dashboard` : "Authority dashboard"}
      </PageTitle>

      <form method="get" className="mb-6 flex flex-wrap items-end gap-3" aria-label="Choose the period">
        {single && user.role === "authority_admin" ? <input type="hidden" name="school" value={single.id} /> : null}
        <div>
          <label htmlFor="period" className="block text-sm font-medium">Period</label>
          <select id="period" name="period" defaultValue={period} className="mt-1 rounded border border-gray-400 bg-white px-2 py-1.5 dark:border-gray-600 dark:bg-gray-900">
            {(Object.keys(PERIODS) as Period[]).map((p) => <option key={p} value={p}>{periodLabel[p]}</option>)}
          </select>
        </div>
        <button type="submit" className="rounded border border-gray-400 px-3 py-1.5 hover:bg-gray-100 dark:border-gray-600 dark:hover:bg-gray-900">Show</button>
        <p className="text-sm text-gray-600 dark:text-gray-300">From {day.format(d.since)} to today, by when the work was added.</p>
      </form>

      <section aria-labelledby="headline-h" className="mb-10">
        <h2 id="headline-h" className="mb-3 text-lg font-medium">{single ? "This school" : `All ${d.schools.length} schools`}</h2>
        <Headline f={d.total.figures} priced={d.priced} />
      </section>

      {!single ? (
        <section aria-labelledby="schools-h" className="mb-10">
          <h2 id="schools-h" className="mb-3 text-lg font-medium">By school</h2>
          <Table
            caption="Figures for each school"
            head={["School", "Teachers", "Scripts", "Pupils marked", "Approved", "Median to approval", "Flagged", "Within 1 mark", "Time saved"]}
          >
            {d.schools.map((s) => (
              <tr key={s.id}>
                <Td><Link href={qs({ school: s.id })} className={linkClass}>{s.name}</Link></Td>
                <Td>{s.staff}</Td>
                <Td>{show(s.figures.scripts, n)}</Td>
                <Td>{show(s.figures.pupilsMarked, n)}</Td>
                <Td>{show(s.figures.shareApproved, pct)}</Td>
                <Td>{show(s.figures.medianHoursToApproval, hours)}</Td>
                <Td>{show(s.figures.flaggedRate, pct)}</Td>
                <Td>{show(s.figures.withinOneRate, pct)}</Td>
                <Td>{show(s.figures.timeSavedMinutes, timeSaved)}</Td>
              </tr>
            ))}
            <tr className="font-medium">
              <Td>All schools</Td>
              <Td>{d.schools.reduce((t, s) => t + s.staff, 0)}</Td>
              <Td>{show(d.total.figures.scripts, n)}</Td>
              <Td>{show(d.total.figures.pupilsMarked, n)}</Td>
              <Td>{show(d.total.figures.shareApproved, pct)}</Td>
              <Td>{show(d.total.figures.medianHoursToApproval, hours)}</Td>
              <Td>{show(d.total.figures.flaggedRate, pct)}</Td>
              <Td>{show(d.total.figures.withinOneRate, pct)}</Td>
              <Td>{show(d.total.figures.timeSavedMinutes, timeSaved)}</Td>
            </tr>
          </Table>
          <p className="mt-3 text-sm text-gray-700 dark:text-gray-300">
            Where only one school&apos;s figure would be hidden, the next smallest is hidden too, so it cannot be worked out from the total.
          </p>
        </section>
      ) : null}

      <section aria-labelledby="agreement-h" className="mb-10">
        <h2 id="agreement-h" className="mb-1 text-lg font-medium">Agreement with the AI, by work type</h2>
        <p className="mb-3 text-sm text-gray-700 dark:text-gray-300">
          From approved scripts the AI marked. Every change a teacher makes to an AI mark is recorded; this is how often they kept it.
        </p>
        <Table caption="Agreement by work type" head={["Work type", "AI-marked, approved", "Kept unchanged", "Within 1 mark", "Flagged", "Minutes per script (assumed)", "Time saved"]}>
          {WORK_TYPES.map((t) => {
            const f = d.total.byType[t];
            return (
              <tr key={t}>
                <Td>{workTypeLabel[t]}</Td>
                <Td>{show(f.aiApproved, n)}</Td>
                <Td>{show(f.keptUnchangedRate, pct)}</Td>
                <Td>{show(f.withinOneRate, pct)}</Td>
                <Td>{show(f.flaggedRate, pct)}</Td>
                <Td>{d.minutes[t]}</Td>
                <Td>{show(f.timeSavedMinutes, timeSaved)}</Td>
              </tr>
            );
          })}
        </Table>
        <p className="mt-3 text-sm text-gray-700 dark:text-gray-300">
          <strong>Time saved assumption:</strong> each AI-marked script a teacher approves saves the minutes shown above, the time to mark it by hand.
          It does not subtract the time spent checking.{" "}
          {user.role === "authority_admin" ? (
            <Link href="/settings" className={linkClass}>Change the minutes per script</Link>
          ) : (
            "Your authority sets these minutes."
          )}
        </p>
      </section>

      <section aria-labelledby="weekly-h" className="mb-10">
        <h2 id="weekly-h" className="mb-1 text-lg font-medium">Adoption, week by week</h2>
        <p className="mb-3 text-sm text-gray-700 dark:text-gray-300">
          Active teachers did something in {single ? "the school" : "a school"} that week beyond signing in. Counts are per school; no figure is shown per teacher.
        </p>
        {single ? (
          <Weekly weeks={single.weekly} caption={`Active teachers and approvals per week at ${single.name}`} />
        ) : (
          <div className="space-y-6">
            <Weekly weeks={d.total.weekly} caption="Active teachers and approvals per week, all schools" />
            <details>
              <summary className="cursor-pointer text-sm font-medium">Each school, week by week</summary>
              <div className="mt-3 grid gap-6 lg:grid-cols-2">
                {d.schools.map((s) => (
                  <div key={s.id}>
                    <h3 className="mb-2 font-medium">{s.name}</h3>
                    <Weekly weeks={s.weekly} caption={`Active teachers and approvals per week at ${s.name}`} />
                  </div>
                ))}
              </div>
            </details>
          </div>
        )}
      </section>
    </AppShell>
  );
}
