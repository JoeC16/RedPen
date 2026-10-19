import { describe, expect, it } from "vitest";
import { choices, demoResultFor, pupilText, recognise, resultFor, teacherMarks } from "@/server/demo/marker";
import { TEMPLATES } from "@/server/demo/templates";
import { DemoProvider } from "@/server/marking/demo";
import { markingResultSchema } from "@/server/marking/result-schema";

// The demo answer banks must be internally consistent, or a demo shows nonsense.
describe("demo templates", () => {
  for (const t of TEMPLATES) {
    describe(t.key, () => {
      it("line maxima add up to the total", () => {
        expect(t.criteria.reduce((n, c) => n + c.max, 0)).toBe(t.totalMarks);
      });

      it("every answer is within the line's maximum, for the AI and the teacher", () => {
        const lines = t.workType === "essay" ? t.essays.map((e) => e.lines) : null;
        if (lines) {
          for (const ls of lines) ls.forEach((l, i) => expect(Math.max(l.awarded, l.teacher ?? 0)).toBeLessThanOrEqual(t.criteria[i]!.max));
        } else if (t.workType !== "essay") {
          t.answers.forEach((bank, i) => bank.forEach((a) => expect(Math.max(a.awarded, a.teacher ?? 0)).toBeLessThanOrEqual(t.criteria[i]!.max)));
        }
      });

      it("every possible script is recognised and marked back to a valid result", () => {
        const n = Math.min(choices(t), 200);
        for (let k = 0; k < n; k++) {
          const choice = t.workType === "essay" ? [k] : t.answers.map((bank, i) => Math.floor(k / t.answers.slice(0, i).reduce((p, b) => p * b.length, 1)) % bank.length);
          const text = pupilText(t, choice);
          expect(recognise(t, text)).toEqual(choice);
          const r = markingResultSchema.parse(resultFor(t, choice));
          expect(r.criteria.map((c) => c.max)).toEqual(t.criteria.map((c) => c.max));
          expect(teacherMarks(t, choice)).toHaveLength(t.criteria.length);
          expect(demoResultFor(t.workType, t.schemeText, text)).toEqual(r);
        }
      });
    });
  }

  it("does not recognise work that was not built from the banks", () => {
    const t = TEMPLATES[0]!;
    expect(demoResultFor(t.workType, t.schemeText, "Q1 something a real pupil wrote")).toBeNull();
    expect(demoResultFor(t.workType, "another scheme", pupilText(t, t.criteria.map(() => 0)))).toBeNull();
  });

  it("DemoProvider marks seeded demo work realistically instead of with a placeholder", async () => {
    const t = TEMPLATES.find((x) => x.key === "fractions")!;
    const res = await new DemoProvider().mark({
      workType: t.workType,
      schemeText: t.schemeText,
      totalMarks: t.totalMarks,
      criteria: t.criteria,
      pupilText: pupilText(t, [0, 1, 1, 0]),
    });
    expect(res.placeholder).toBe(false);
    expect((res.raw as { criteria: { awarded: number }[] }).criteria.map((c) => c.awarded)).toEqual([2, 2, 1, 2]);
  });
});
