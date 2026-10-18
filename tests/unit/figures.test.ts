import { describe, expect, it } from "vitest";
import { costUsd, count, EMPTY_ROW, figures, protectBreakdown, protectRows, rate, type SummaryRow } from "@/server/oversight/figures";

const minutes = { short: 3, maths: 4, essay: 8 };
const row = (over: Partial<SummaryRow>): SummaryRow => ({ ...EMPTY_ROW, ...over });

describe("small-group suppression", () => {
  it("hides counts of 1 to 4, shows zero and 5 or more", () => {
    expect([0, 1, 4, 5, 30].map(count)).toEqual([0, "small", "small", 5, 30]);
  });

  it("hides shares of groups smaller than 5, and has nothing to show for an empty group", () => {
    expect(rate(2, 4)).toBe("small");
    expect(rate(4, 5)).toBe(0.8);
    expect(rate(0, 0)).toBeNull();
  });

  it("hides a second cell when a lone hidden one could be worked out from the total", () => {
    expect(protectBreakdown([12, "small", 7, 0])).toEqual([12, "small", "small", 0]);
    expect(protectBreakdown([12, "small", "small"])).toEqual([12, "small", "small"]);
    expect(protectBreakdown([12, 9, 0])).toEqual([12, 9, 0]);
  });

  it("applies the second hiding column by column across rows", () => {
    const f = (r: Partial<SummaryRow>) => figures(row(r), { minutes, byType: {}, prices: null });
    const out = protectRows({ a: f({ scripts: 3 }), b: f({ scripts: 6 }), c: f({ scripts: 20 }) });
    expect([out.a.scripts, out.b.scripts, out.c.scripts]).toEqual(["small", "small", 20]);
  });
});

describe("figures", () => {
  const r = row({
    scripts: 10,
    pupils: 10,
    pupilsMarked: 8,
    assignmentsMarked: 2,
    approved: 8,
    medianHoursToApproval: 20,
    aiScripts: 10,
    flagged: 3,
    aiApproved: 8,
    keptUnchanged: 6,
    withinOne: 7,
    aiRuns: 10,
    tokensIn: 30_000,
    cacheReadTokens: 10_000,
    tokensOut: 5_000,
  });

  it("computes each figure from the aggregates", () => {
    const f = figures(r, { minutes, byType: { short: row({ aiApproved: 5 }), essay: row({ aiApproved: 3 }) }, prices: { input: 4, cacheRead: 0.2, output: 20 } });
    expect(f).toEqual({
      scripts: 10,
      pupilsMarked: 8,
      assignmentsMarked: 2,
      shareApproved: 0.8,
      medianHoursToApproval: 20,
      flaggedRate: 0.3,
      aiApproved: 8,
      keptUnchangedRate: 0.75,
      withinOneRate: 0.875,
      timeSavedMinutes: 5 * 3 + 3 * 8,
      costPerScriptUsd: (20_000 * 4 + 10_000 * 0.2 + 5_000 * 20) / 1e6 / 10,
    });
  });

  it("shows no cost unless prices are configured", () => {
    expect(figures(r, { minutes, byType: {}, prices: null }).costPerScriptUsd).toBeNull();
    expect(costUsd(row({ tokensIn: 1e6 }), { input: 4, cacheRead: 0, output: 0 })).toBe(4);
  });

  it("suppresses everything built from a small group", () => {
    const f = figures(row({ scripts: 3, pupilsMarked: 3, assignmentsMarked: 1, approved: 3, medianHoursToApproval: 5, aiScripts: 3, aiApproved: 3, keptUnchanged: 3, withinOne: 3 }), {
      minutes,
      byType: { short: row({ aiApproved: 3 }) },
      prices: { input: 1, cacheRead: 0, output: 1 },
    });
    for (const v of Object.values(f)) expect(v).toBe("small");
  });
});
