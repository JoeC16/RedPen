import { asc, eq, sql } from "drizzle-orm";
import { authority, school } from "../db/schema";
import {
  EMPTY_ROW,
  figures,
  protectRows,
  WORK_TYPES,
  count,
  type Figures,
  type Prices,
  type SummaryRow,
  type WorkType,
} from "../oversight/figures";
import { requireRole, withTenant, type Ctx } from "../tenancy";
import { isUuid } from "./ids";

export const PERIODS = { "6w": 6, "13w": 13, "52w": 52 } as const;
export type Period = keyof typeof PERIODS;

export type WeekPoint = { week: string; activeTeachers: number; approvals: number | "small" };

export type SchoolFigures = {
  id: string;
  name: string;
  staff: number;
  figures: Figures;
  byType: Record<WorkType, Figures>;
  weekly: WeekPoint[];
};

export type Dashboard = {
  scope: "authority" | "school";
  since: Date;
  weeks: number;
  minutes: Record<WorkType, number>;
  priced: boolean;
  schools: SchoolFigures[];
  /** All schools in scope together (for a school dashboard, the same school). */
  total: { figures: Figures; byType: Record<WorkType, Figures>; weekly: WeekPoint[] };
};

function prices(): Prices | null {
  const p = {
    input: Number(process.env.MODEL_PRICE_INPUT_PER_MTOK ?? 0),
    cacheRead: Number(process.env.MODEL_PRICE_CACHE_READ_PER_MTOK ?? 0),
    output: Number(process.env.MODEL_PRICE_OUTPUT_PER_MTOK ?? 0),
  };
  return p.input > 0 || p.output > 0 ? p : null;
}

type RawSummary = {
  school_id: string | null;
  work_type: WorkType | null;
  scripts: number;
  pupils: number;
  assignments_marked: number;
  pupils_marked: number;
  approved: number;
  median_hours_to_approval: number | null;
  ai_scripts: number;
  flagged: number;
  ai_approved: number;
  kept_unchanged: number;
  within_one: number;
  ai_runs: number;
  tokens_in: string | number;
  tokens_out: string | number;
  cache_read_tokens: string | number;
};

function toRow(r: RawSummary): SummaryRow {
  return {
    scripts: r.scripts,
    pupils: r.pupils,
    assignmentsMarked: r.assignments_marked,
    pupilsMarked: r.pupils_marked,
    approved: r.approved,
    medianHoursToApproval: r.median_hours_to_approval === null ? null : Number(r.median_hours_to_approval),
    aiScripts: r.ai_scripts,
    flagged: r.flagged,
    aiApproved: r.ai_approved,
    keptUnchanged: r.kept_unchanged,
    withinOne: r.within_one,
    aiRuns: r.ai_runs,
    tokensIn: Number(r.tokens_in),
    tokensOut: Number(r.tokens_out),
    cacheReadTokens: Number(r.cache_read_tokens),
  };
}

/**
 * The oversight dashboard. Authority admins see every school in their
 * authority (or one, with `schoolId`); school admins see their own school.
 * Only aggregates are read, and small groups are suppressed.
 */
export async function getDashboard(ctx: Ctx, opts: { period?: Period; schoolId?: string } = {}): Promise<Dashboard | null> {
  requireRole(ctx, "authority_admin", "school_admin");
  const weeks = PERIODS[opts.period ?? "6w"];
  let schoolId: string | null = null;
  if (ctx.role === "school_admin") schoolId = ctx.schoolId;
  else if (opts.schoolId) {
    if (!isUuid(opts.schoolId)) return null;
    schoolId = opts.schoolId;
  }
  // The database counts from the start of that week, so the first week is a whole one.
  const since = new Date(Date.now() - (weeks - 1) * 7 * 86_400_000);
  const sinceIso = since.toISOString();

  return withTenant(ctx, async (tx) => {
    const [auth] = await tx.select({ minutes: authority.timeSavedMinutes }).from(authority).where(eq(authority.id, ctx.authorityId));
    const schools = await tx
      .select({
        id: school.id,
        name: school.name,
        // Written out in full: Drizzle leaves columns unqualified inside a select's sql, which would bind to the subquery.
        staff: sql<number>`(select count(*)::int from app_user u where u.school_id = "school"."id" and u.role = 'teacher' and u.disabled_at is null)`,
      })
      .from(school)
      .where(schoolId ? sql`${school.id} = ${schoolId} and ${school.authorityId} = ${ctx.authorityId}` : eq(school.authorityId, ctx.authorityId))
      .orderBy(asc(school.name));
    if (schoolId && schools.length === 0) return null;

    const summary = (
      await tx.execute<RawSummary>(sql`select * from app_oversight_summary(${schoolId}::uuid, ${sinceIso}::timestamptz)`)
    ).map((r) => ({ schoolId: r.school_id, workType: r.work_type, row: toRow(r) }));
    const weekly = await tx.execute<{ school_id: string; week: string; active_teachers: number; approvals: number }>(
      sql`select school_id, week::text as week, active_teachers, approvals from app_oversight_weekly(${schoolId}::uuid, ${sinceIso}::timestamptz)`,
    );

    const minutes = { short: 3, maths: 4, essay: 8, ...(auth?.minutes ?? {}) };
    const priced = prices();
    const find = (sid: string | null, wt: WorkType | null) =>
      summary.find((s) => s.schoolId === sid && s.workType === wt)?.row ?? EMPTY_ROW;

    const groupFor = (sid: string | null) => {
      const typeRows = Object.fromEntries(WORK_TYPES.map((t) => [t, find(sid, t)])) as Record<WorkType, SummaryRow>;
      const byType = protectRows(
        Object.fromEntries(
          WORK_TYPES.map((t) => [t, figures(typeRows[t], { minutes, byType: { [t]: typeRows[t] }, prices: priced })]),
        ) as Record<WorkType, Figures>,
      );
      return { figures: figures(find(sid, null), { minutes, byType: typeRows, prices: priced }), byType };
    };

    const weeksFor = (rows: { week: string; active_teachers: number; approvals: number }[]): WeekPoint[] => {
      const byWeek = new Map<string, { a: number; p: number }>();
      for (const r of rows) {
        const w = byWeek.get(r.week) ?? { a: 0, p: 0 };
        byWeek.set(r.week, { a: w.a + r.active_teachers, p: w.p + r.approvals });
      }
      return [...byWeek.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([week, v]) => ({ week, activeTeachers: v.a, approvals: count(v.p) as number | "small" }));
    };

    const perSchool = schools.map((s) => ({
      id: s.id,
      name: s.name,
      staff: s.staff,
      ...groupFor(s.id),
      weekly: weeksFor(weekly.filter((w) => w.school_id === s.id)),
    }));
    // Secondary suppression across schools, since the authority total is shown too.
    if (perSchool.length > 1) {
      const protectedFigures = protectRows(Object.fromEntries(perSchool.map((s) => [s.id, s.figures])));
      for (const s of perSchool) s.figures = protectedFigures[s.id]!;
    }
    const total = schoolId ? { figures: perSchool[0]!.figures, byType: perSchool[0]!.byType } : groupFor(null);

    return {
      scope: ctx.role === "authority_admin" && !schoolId ? "authority" : "school",
      since,
      weeks,
      minutes,
      priced: priced !== null,
      schools: perSchool,
      total: { ...total, weekly: weeksFor([...weekly]) },
    };
  });
}
