// Builds demo pupil work from the answer banks, and marks it back. The seed
// uses both halves; DemoProvider uses the second, so seeded work marked live in
// a demo gets the same realistic result. Anything not built from the banks is
// not recognised (null), and DemoProvider then says so instead of pretending.
import { createHash } from "node:crypto";
import type { MarkingResult } from "../marking/result-schema";
import { TEMPLATES, type EssayTemplate, type LinedTemplate, type Template } from "./templates";

const norm = (s: string) => s.replace(/\s+/g, " ").trim();
const pick = <T,>(list: T[], seed: string): T => list[parseInt(createHash("sha256").update(seed).digest("hex").slice(0, 8), 16) % list.length]!;

/** One choice per criterion (lined), or a single essay index. */
export type Choice = number[];

export function choices(t: Template): number {
  return t.workType === "essay" ? t.essays.length : t.answers.reduce((n, a) => n * a.length, 1);
}

export function pupilText(t: Template, choice: Choice): string {
  if (t.workType === "essay") return t.essays[choice[0]!]!.text;
  return t.criteria.map((c, i) => `${c.label} ${t.answers[i]![choice[i]!]!.text}`).join("\n");
}

/** The marks a careful teacher would approve for this choice. */
export function teacherMarks(t: Template, choice: Choice): number[] {
  if (t.workType === "essay") return t.essays[choice[0]!]!.lines.map((l) => l.teacher ?? l.awarded);
  return t.answers.map((bank, i) => bank[choice[i]!]!.teacher ?? bank[choice[i]!]!.awarded);
}

function linedResult(t: LinedTemplate, choice: Choice, text: string): MarkingResult {
  const chosen = t.answers.map((bank, i) => bank[choice[i]!]!);
  const awarded = chosen.reduce((n, a) => n + a.awarded, 0);
  const flags = chosen.flatMap((a) => (a.flag ? [a.flag] : []));
  const share = awarded / t.totalMarks;
  return {
    transcription: "",
    criteria: t.criteria.map((c, i) => ({ point: c.label, awarded: chosen[i]!.awarded, max: c.max, evidence: chosen[i]!.evidence, comment: chosen[i]!.comment })),
    feedback: pick(share >= 0.75 ? t.feedback.strong : share >= 0.4 ? t.feedback.middle : t.feedback.weak, text),
    confidence: flags.length >= 2 ? "low" : flags.length === 1 ? "medium" : "high",
    flags,
  };
}

function essayResult(t: EssayTemplate, choice: Choice): MarkingResult {
  const e = t.essays[choice[0]!]!;
  return {
    transcription: "",
    criteria: t.criteria.map((c, i) => ({ point: c.label, awarded: e.lines[i]!.awarded, max: c.max, evidence: e.lines[i]!.evidence, comment: e.lines[i]!.comment })),
    feedback: e.feedback,
    confidence: e.flags.length ? "medium" : "high",
    flags: e.flags,
  };
}

export function resultFor(t: Template, choice: Choice): MarkingResult {
  return t.workType === "essay" ? essayResult(t, choice) : linedResult(t, choice, pupilText(t, choice));
}

/** Which bank answers a piece of work was built from, or null if it was not. */
export function recognise(t: Template, text: string): Choice | null {
  if (t.workType === "essay") {
    const i = t.essays.findIndex((e) => norm(e.text) === norm(text));
    return i < 0 ? null : [i];
  }
  const sections = new Map<string, string>();
  let current: string | null = null;
  for (const line of text.split("\n")) {
    const m = /^(Q\d+)\s+(.*)$/.exec(line.trim());
    if (m) {
      current = m[1]!;
      sections.set(current, m[2]!);
    } else if (current) sections.set(current, `${sections.get(current)} ${line}`);
  }
  const choice: Choice = [];
  for (const [i, c] of t.criteria.entries()) {
    const answer = sections.get(c.label);
    const j = answer === undefined ? -1 : t.answers[i]!.findIndex((a) => norm(a.text) === norm(answer));
    if (j < 0) return null;
    choice.push(j);
  }
  return sections.size === t.criteria.length ? choice : null;
}

/** DemoProvider's lookup: a realistic result for seeded demo work, else null. */
export function demoResultFor(workType: string, schemeText: string, text: string): MarkingResult | null {
  for (const t of TEMPLATES) {
    if (t.workType !== workType || norm(t.schemeText) !== norm(schemeText)) continue;
    const c = recognise(t, text);
    if (c) return resultFor(t, c);
  }
  return null;
}
