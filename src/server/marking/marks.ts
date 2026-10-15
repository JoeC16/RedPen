import { z } from "zod";

/** Round to the nearest half mark. */
export function roundHalf(x: number): number {
  return Math.round(x * 2) / 2;
}

/** Round to the nearest half mark, then clamp to 0..max. */
export function clampMark(x: number, max: number): number {
  if (!Number.isFinite(x)) return 0;
  return Math.min(max, Math.max(0, roundHalf(x)));
}

export const criterionSchema = z.object({
  label: z.string().trim().min(1, "Every line needs a label").max(80),
  // Not coerced: a blank field must be an error, not silently 0.
  max: z.number({ error: "Every mark line needs a maximum mark." }).int("Maximum marks must be whole numbers.").min(0).max(500),
});
export type Criterion = z.infer<typeof criterionSchema>;

export const WORK_TYPES = ["short", "maths", "essay"] as const;
export type WorkType = (typeof WORK_TYPES)[number];

export const workTypeLabel: Record<WorkType, string> = {
  short: "Short answers",
  maths: "Maths working",
  essay: "Essay (feedback draft)",
};

/** The scheme a teacher writes: free text plus one line per question or criterion. */
export const schemeSchema = z
  .object({
    title: z.string().trim().min(1, "Give the assignment a title").max(200),
    workType: z.enum(WORK_TYPES),
    schemeText: z.string().trim().min(1, "Paste the questions and mark scheme").max(50_000),
    totalMarks: z.coerce.number().int().min(1).max(500),
    criteria: z.array(criterionSchema).min(1, "Add at least one mark line").max(50),
  })
  .superRefine((s, ctx) => {
    const sum = s.criteria.reduce((n, c) => n + c.max, 0);
    if (sum !== s.totalMarks) {
      ctx.addIssue({
        code: "custom",
        path: ["criteria"],
        message: `The mark lines add up to ${sum}, but the total is ${s.totalMarks}.`,
      });
    }
    const labels = s.criteria.map((c) => c.label.toLowerCase());
    if (new Set(labels).size !== labels.length) {
      ctx.addIssue({ code: "custom", path: ["criteria"], message: "Each mark line needs a different label." });
    }
  });
export type SchemeInput = z.infer<typeof schemeSchema>;

export type Line = { max: number; aiAwarded: number | null; finalAwarded: number | null };

/** Sum of final marks; null if any line is still unmarked. */
export function finalTotal(lines: Line[]): number | null {
  let total = 0;
  for (const l of lines) {
    if (l.finalAwarded === null) return null;
    total += l.finalAwarded;
  }
  return total;
}

/** Agreement data for an approval. Null when there were no AI marks to compare with. */
export function agreement(lines: Line[]): { aiTotal: number | null; linesChanged: number | null } {
  if (lines.some((l) => l.aiAwarded === null)) return { aiTotal: null, linesChanged: null };
  return {
    aiTotal: lines.reduce((n, l) => n + (l.aiAwarded ?? 0), 0),
    linesChanged: lines.filter((l) => l.finalAwarded !== l.aiAwarded).length,
  };
}

export type QueueItem = {
  status: "todo" | "marking" | "review" | "approved" | "failed";
  absent: boolean;
  hasWork: boolean;
  confidence: "high" | "medium" | "low" | null;
  flagCount: number;
  pupilCode: string;
};

/**
 * Review queue order (principle 3, surface doubt first):
 * failed, then flagged or low-confidence work, then medium, then the rest
 * awaiting review, then work not yet marked, then no work, then absent, then approved.
 */
export function queueRank(i: QueueItem): number {
  if (i.status === "approved") return 90;
  if (i.absent) return 80;
  if (i.status === "failed") return 0;
  if (i.status === "review") {
    if (i.flagCount > 0 || i.confidence === "low") return 10;
    if (i.confidence === "medium") return 20;
    return 30;
  }
  if (i.status === "marking") return 40;
  return i.hasWork ? 50 : 70;
}

export function sortQueue<T extends QueueItem>(items: T[]): T[] {
  return [...items].sort((a, b) => queueRank(a) - queueRank(b) || a.pupilCode.localeCompare(b.pupilCode));
}
