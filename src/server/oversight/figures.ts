// Dashboard figures from the database aggregates, with small numbers
// suppressed. Pure functions, so the rules are unit-tested on their own.
//
// Founder decision 2026-10-18: a figure built from fewer than 5 pupils or
// scripts is not shown. Counts of active teachers per school are shown as
// they are; nothing is ever shown per teacher.

export const MIN_GROUP = 5;

/** A number, "small" when suppressed, or null when there is nothing to show. */
export type Cell = number | "small" | null;

export type WorkType = "short" | "maths" | "essay";
export const WORK_TYPES: WorkType[] = ["short", "maths", "essay"];

/** One aggregate row as app_oversight_summary returns it. */
export type SummaryRow = {
  scripts: number;
  pupils: number;
  assignmentsMarked: number;
  pupilsMarked: number;
  approved: number;
  medianHoursToApproval: number | null;
  aiScripts: number;
  flagged: number;
  aiApproved: number;
  keptUnchanged: number;
  withinOne: number;
  aiRuns: number;
  tokensIn: number;
  tokensOut: number;
  cacheReadTokens: number;
};

export const EMPTY_ROW: SummaryRow = {
  scripts: 0,
  pupils: 0,
  assignmentsMarked: 0,
  pupilsMarked: 0,
  approved: 0,
  medianHoursToApproval: null,
  aiScripts: 0,
  flagged: 0,
  aiApproved: 0,
  keptUnchanged: 0,
  withinOne: 0,
  aiRuns: 0,
  tokensIn: 0,
  tokensOut: 0,
  cacheReadTokens: 0,
};

export type Prices = { input: number; cacheRead: number; output: number };

export type Figures = {
  scripts: Cell;
  pupilsMarked: Cell;
  assignmentsMarked: Cell;
  shareApproved: Cell;
  medianHoursToApproval: Cell;
  flaggedRate: Cell;
  /** Approved scripts that had AI marks: the base for the agreement figures. */
  aiApproved: Cell;
  keptUnchangedRate: Cell;
  withinOneRate: Cell;
  timeSavedMinutes: Cell;
  costPerScriptUsd: Cell;
};

/** A count: suppressed when it is 1 to 4 (zero reveals nothing about anyone). */
export function count(n: number): Cell {
  return n > 0 && n < MIN_GROUP ? "small" : n;
}

/** A share of a group: suppressed when the group is smaller than 5. */
export function rate(part: number, whole: number): Cell {
  if (whole === 0) return null;
  return whole < MIN_GROUP ? "small" : part / whole;
}

/**
 * Secondary suppression. When a breakdown is shown next to its total and
 * exactly one cell is suppressed, the total minus the others would reveal it,
 * so the next smallest non-zero cell is suppressed too.
 */
export function protectBreakdown(cells: Cell[]): Cell[] {
  const out = [...cells];
  if (out.filter((c) => c === "small").length !== 1) return out;
  let best = -1;
  for (let i = 0; i < out.length; i++) {
    const c = out[i];
    if (typeof c === "number" && c > 0 && (best < 0 || c < (out[best] as number))) best = i;
  }
  if (best >= 0) out[best] = "small";
  return out;
}

export function costUsd(r: SummaryRow, p: Prices): number {
  const uncached = Math.max(0, r.tokensIn - r.cacheReadTokens);
  return (uncached * p.input + r.cacheReadTokens * p.cacheRead + r.tokensOut * p.output) / 1e6;
}

/**
 * The figures for one group. Time saved needs the per-work-type rows, because
 * the minutes per script differ by type; pass them for a mixed group.
 */
export function figures(
  r: SummaryRow,
  opts: { minutes: Record<WorkType, number>; byType: Partial<Record<WorkType, SummaryRow>>; prices: Prices | null },
): Figures {
  const minutes = WORK_TYPES.reduce((m, t) => m + (opts.byType[t]?.aiApproved ?? 0) * (opts.minutes[t] ?? 0), 0);
  return {
    scripts: count(r.scripts),
    pupilsMarked: count(r.pupilsMarked),
    // An assignment is marked for a whole class, but a figure from fewer than
    // 5 marked pupils could still single someone out.
    assignmentsMarked: r.pupilsMarked < MIN_GROUP && r.pupilsMarked > 0 ? "small" : r.assignmentsMarked,
    shareApproved: rate(r.approved, r.scripts),
    medianHoursToApproval: r.approved === 0 ? null : r.approved < MIN_GROUP ? "small" : r.medianHoursToApproval,
    flaggedRate: rate(r.flagged, r.aiScripts),
    aiApproved: count(r.aiApproved),
    keptUnchangedRate: rate(r.keptUnchanged, r.aiApproved),
    withinOneRate: rate(r.withinOne, r.aiApproved),
    timeSavedMinutes: r.aiApproved === 0 ? null : r.aiApproved < MIN_GROUP ? "small" : minutes,
    costPerScriptUsd: !opts.prices || r.aiScripts === 0 ? null : r.aiScripts < MIN_GROUP ? "small" : costUsd(r, opts.prices) / r.aiScripts,
  };
}

/** Apply secondary suppression column by column across breakdown rows. */
export function protectRows<K extends string>(rows: Record<K, Figures>, keys: (keyof Figures)[] = COUNT_FIGURES): Record<K, Figures> {
  const ids = Object.keys(rows) as K[];
  const out = Object.fromEntries(ids.map((k) => [k, { ...rows[k] }])) as Record<K, Figures>;
  for (const key of keys) {
    const cells = protectBreakdown(ids.map((k) => rows[k][key]));
    ids.forEach((k, i) => (out[k][key] = cells[i]!));
  }
  return out;
}

/** Figures that add up to the total, so a single suppressed cell could be worked out. */
export const COUNT_FIGURES: (keyof Figures)[] = ["scripts", "pupilsMarked", "aiApproved", "timeSavedMinutes"];
