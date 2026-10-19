import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CLAIMS } from "@/content/claims";
import { claimsMarkdown, confirmed } from "@/content/claims-doc";

describe("claims register", () => {
  it("has unique ids", () => {
    const ids = CLAIMS.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("our own claims point at files that exist", () => {
    for (const c of CLAIMS.filter((x) => x.topic === "ours")) {
      expect(c.evidence?.length, c.id).toBeGreaterThan(0);
      for (const e of c.evidence ?? []) expect(existsSync(e.split(" (")[0]!), `${c.id}: ${e}`).toBe(true);
    }
  });

  it("every confirmed provider or guidance claim quotes a dated primary source", () => {
    for (const c of CLAIMS.filter((x) => x.topic !== "ours" && x.status === "confirmed")) {
      expect(c.sources?.length, c.id).toBeGreaterThan(0);
      for (const s of c.sources ?? []) {
        expect(s.url, c.id).toMatch(/^https:\/\//);
        expect(s.quote.length, c.id).toBeGreaterThan(10);
        expect(s.checked, c.id).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      }
    }
  });

  it("every unconfirmed claim has a neutral question, which is all the product shows", () => {
    for (const c of CLAIMS.filter((x) => x.status === "unconfirmed")) expect(c.question?.length, c.id).toBeGreaterThan(10);
  });

  it("refuses to show an unconfirmed or unknown claim", () => {
    expect(() => confirmed("no.such.claim")).toThrow(/Unknown/);
    const open = CLAIMS.find((c) => c.status === "unconfirmed");
    if (open) expect(() => confirmed(open.id)).toThrow(/not confirmed/);
  });

  it("docs/claims.md is up to date (run npm run docs:claims)", () => {
    expect(readFileSync("docs/claims.md", "utf8")).toBe(claimsMarkdown());
  });
});
