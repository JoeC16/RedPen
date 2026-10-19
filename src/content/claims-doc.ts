// Renders the claims register as docs/claims.md. Pure, so a test can check the
// committed file is up to date.
import { CLAIMS, type Claim } from "./claims";

const heading: Record<Claim["topic"], string> = {
  ours: "How Red Pen is built",
  provider: "The AI provider (Anthropic)",
  hosting: "Hosting (Fly.io)",
  guidance: "UK guidance",
};

function entry(c: Claim): string {
  const lines = [`### ${c.id}`, "", `**${c.status === "confirmed" ? "Confirmed" : "NOT CONFIRMED"}.** ${c.statement}`, ""];
  if (c.evidence?.length) lines.push("Evidence in this repository:", "", ...c.evidence.map((e) => `- \`${e.split(" (")[0]}\`${e.includes(" (") ? ` (${e.split(" (").slice(1).join(" (")}` : ""}`), "");
  for (const s of c.sources ?? []) {
    lines.push(`Source: [${s.title}](${s.url}), read ${s.checked}.`, "", `> ${s.quote}`, "");
  }
  if (c.question) lines.push(`Open question: ${c.question}`, "");
  if (c.note) lines.push(`Note: ${c.note}`, "");
  return lines.join("\n");
}

export function claimsMarkdown(): string {
  const out = [
    "# Claims register",
    "",
    "<!-- Generated from src/content/claims.ts by `npm run docs:claims`. Do not edit by hand. -->",
    "",
    "Every statement Red Pen makes about how data is handled, with its evidence. Statements about our own system point to the code and tests that make them true. Statements about the AI provider and about UK guidance quote the primary source and give the date it was read.",
    "",
    "Only **confirmed** claims appear in the app, the trust centre or the generated documents. **NOT CONFIRMED** items must not be used in marketing or sales material until they are checked.",
    "",
    "Re-check provider and guidance claims before each sales conversation and at least every six months: terms and guidance change.",
    "",
  ];
  for (const topic of ["ours", "provider", "hosting", "guidance"] as const) {
    const list = CLAIMS.filter((c) => c.topic === topic);
    if (!list.length) continue;
    out.push(`## ${heading[topic]}`, "", ...list.map(entry));
  }
  return out.join("\n").replace(/\n{3,}/g, "\n\n").trimEnd() + "\n";
}

/** A confirmed claim's statement, for use in pages. Throws for an unknown or unconfirmed id, so nothing unchecked can be shown. */
export function confirmed(id: string): string {
  const c = CLAIMS.find((x) => x.id === id);
  if (!c) throw new Error(`Unknown claim ${id}`);
  if (c.status !== "confirmed") throw new Error(`Claim ${id} is not confirmed and must not be shown`);
  return c.statement;
}
