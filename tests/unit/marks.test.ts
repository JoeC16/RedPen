import { describe, expect, it } from "vitest";
import { agreement, clampMark, finalTotal, roundHalf, schemeSchema, sortQueue, type QueueItem } from "@/server/marking/marks";

describe("clampMark", () => {
  it("rounds to the nearest half mark", () => {
    expect(roundHalf(1.3)).toBe(1.5);
    expect(roundHalf(1.2)).toBe(1);
    expect(clampMark(1.74, 3)).toBe(1.5);
    expect(clampMark(1.75, 3)).toBe(2);
  });
  it("clamps to 0..max", () => {
    expect(clampMark(7, 2)).toBe(2);
    expect(clampMark(-1, 2)).toBe(0);
    expect(clampMark(Number.NaN, 2)).toBe(0);
  });
});

const scheme = {
  title: "T",
  workType: "short",
  schemeText: "Q1",
  totalMarks: 3,
  criteria: [
    { label: "Q1", max: 1 },
    { label: "Q2", max: 2 },
  ],
};

describe("schemeSchema", () => {
  it("accepts lines that sum to the total", () => {
    expect(schemeSchema.safeParse(scheme).success).toBe(true);
  });
  it("rejects lines that do not sum to the total, with a readable message", () => {
    const r = schemeSchema.safeParse({ ...scheme, totalMarks: 4 });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0]?.message).toBe("The mark lines add up to 3, but the total is 4.");
  });
  it("rejects a blank maximum rather than treating it as 0", () => {
    const r = schemeSchema.safeParse({ ...scheme, criteria: [{ label: "Q1", max: null }, { label: "Q2", max: 3 }] });
    expect(r.success).toBe(false);
  });
  it("rejects duplicate labels and unknown work types", () => {
    expect(schemeSchema.safeParse({ ...scheme, criteria: [{ label: "Q1", max: 1 }, { label: "q1", max: 2 }] }).success).toBe(false);
    expect(schemeSchema.safeParse({ ...scheme, workType: "poem" }).success).toBe(false);
  });
});

describe("totals and agreement", () => {
  it("has no total until every line is marked", () => {
    expect(finalTotal([{ max: 2, aiAwarded: null, finalAwarded: 1 }, { max: 2, aiAwarded: null, finalAwarded: null }])).toBeNull();
    expect(finalTotal([{ max: 2, aiAwarded: null, finalAwarded: 1 }, { max: 2, aiAwarded: null, finalAwarded: 1.5 }])).toBe(2.5);
  });
  it("records no agreement data for manual marking", () => {
    expect(agreement([{ max: 2, aiAwarded: null, finalAwarded: 1 }])).toEqual({ aiTotal: null, linesChanged: null });
  });
  it("counts lines the teacher changed from the AI mark", () => {
    expect(
      agreement([
        { max: 2, aiAwarded: 2, finalAwarded: 2 },
        { max: 2, aiAwarded: 1, finalAwarded: 0.5 },
      ]),
    ).toEqual({ aiTotal: 3, linesChanged: 1 });
  });
});

describe("review queue order", () => {
  const item = (pupilCode: string, over: Partial<QueueItem>): QueueItem => ({
    pupilCode,
    status: "review",
    absent: false,
    hasWork: true,
    confidence: "high",
    flagCount: 0,
    ...over,
  });
  it("puts doubt first and approved work last", () => {
    const sorted = sortQueue([
      item("A-approved", { status: "approved" }),
      item("B-high", {}),
      item("C-absent", { status: "todo", absent: true }),
      item("D-flagged", { flagCount: 1 }),
      item("E-low", { confidence: "low" }),
      item("F-medium", { confidence: "medium" }),
      item("G-failed", { status: "failed" }),
      item("H-todo", { status: "todo" }),
      item("I-nowork", { status: "todo", hasWork: false }),
    ]);
    expect(sorted.map((s) => s.pupilCode)).toEqual([
      "G-failed",
      "D-flagged",
      "E-low",
      "F-medium",
      "B-high",
      "H-todo",
      "I-nowork",
      "C-absent",
      "A-approved",
    ]);
  });
});
