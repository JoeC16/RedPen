// Evaluation harness (CLAUDE.md, marking engine). Runs the current prompt over
// every case in /eval and reports agreement with the reference marks.
//
//   npm run eval                      Claude if ANTHROPIC_API_KEY is set, else the demo provider
//   npm run eval -- --provider=demo   force a provider
//   npm run eval -- --check           exit 1 if within-one agreement fell more than EVAL_MAX_DROP below eval/baseline.json
//   npm run eval -- --update-baseline record this Claude run as the new baseline
//
// Never fudge these numbers: they are what we show authorities.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { EVAL_CASES, type EvalCase } from "../eval/cases";
import { getProvider, markingMode } from "../src/server/marking/config";
import { DemoProvider } from "../src/server/marking/demo";
import { PROMPT_VERSION } from "../src/server/marking/prompt";
import { propose } from "../src/server/marking/propose";

const EVAL_DIR = path.resolve(import.meta.dirname, "../eval");
const args = new Set(process.argv.slice(2));
const providerArg = [...args].find((a) => a.startsWith("--provider="))?.split("=")[1];
const providerName = providerArg ?? (markingMode() === "claude" ? "claude" : "demo");
const provider = providerName === "demo" ? new DemoProvider() : getProvider();

const price = {
  input: Number(process.env.MODEL_PRICE_INPUT_PER_MTOK ?? 0),
  cacheRead: Number(process.env.MODEL_PRICE_CACHE_READ_PER_MTOK ?? 0),
  output: Number(process.env.MODEL_PRICE_OUTPUT_PER_MTOK ?? 0),
};

type CaseResult = {
  id: string;
  workType: EvalCase["workType"];
  ok: boolean;
  error?: string;
  reference: number[];
  ai: number[];
  exactLines: number;
  lines: number;
  referenceTotal: number;
  aiTotal: number | null;
  withinOne: boolean;
  confidence: "high" | "medium" | "low" | null;
  flags: number;
  latencyMs: number;
  costUsd: number;
  model: string | null;
};

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

async function runCase(c: EvalCase): Promise<CaseResult> {
  const reference = c.reference.marks;
  const base = { id: c.id, workType: c.workType, reference, lines: reference.length, referenceTotal: sum(reference) };
  try {
    const p = await propose(
      provider,
      { workType: c.workType, schemeText: c.schemeText, totalMarks: c.totalMarks, criteria: c.criteria, pupilText: c.pupilWork },
      c.criteria,
      c.pupilWork,
    );
    const ai = p.lines.map((l) => l.awarded);
    const aiTotal = sum(ai);
    const uncached = p.meta.tokensIn - p.meta.cacheReadTokens;
    return {
      ...base,
      ok: true,
      ai,
      exactLines: ai.filter((m, i) => m === reference[i]).length,
      aiTotal,
      withinOne: Math.abs(aiTotal - base.referenceTotal) <= 1,
      confidence: p.confidence,
      flags: p.flags.length,
      latencyMs: p.meta.latencyMs,
      costUsd: (uncached * price.input + p.meta.cacheReadTokens * price.cacheRead + p.meta.tokensOut * price.output) / 1e6,
      model: p.meta.model,
    };
  } catch (err) {
    return { ...base, ok: false, error: (err as Error).message, ai: [], exactLines: 0, aiTotal: null, withinOne: false, confidence: null, flags: 0, latencyMs: 0, costUsd: 0, model: null };
  }
}

type Summary = {
  scripts: number;
  failed: number;
  exactLineAgreement: number;
  withinOneMark: number;
  highConfidence: { scripts: number; withinOne: number | null };
  meanLatencyMs: number;
  meanCostUsd: number;
};

function summarise(rs: CaseResult[]): Summary {
  const lines = sum(rs.map((r) => r.lines));
  const high = rs.filter((r) => r.confidence === "high");
  return {
    scripts: rs.length,
    failed: rs.filter((r) => !r.ok).length,
    exactLineAgreement: lines ? sum(rs.map((r) => r.exactLines)) / lines : 0,
    withinOneMark: rs.length ? rs.filter((r) => r.withinOne).length / rs.length : 0,
    highConfidence: { scripts: high.length, withinOne: high.length ? high.filter((r) => r.withinOne).length / high.length : null },
    meanLatencyMs: rs.length ? sum(rs.map((r) => r.latencyMs)) / rs.length : 0,
    meanCostUsd: rs.length ? sum(rs.map((r) => r.costUsd)) / rs.length : 0,
  };
}

const pct = (x: number | null) => (x === null ? "  n/a" : `${(x * 100).toFixed(0).padStart(4)}%`);

function printRow(label: string, s: Summary) {
  console.log(
    `${label.padEnd(8)} ${String(s.scripts).padStart(7)} ${pct(s.exactLineAgreement).padStart(11)} ${pct(s.withinOneMark).padStart(11)} ` +
      `${`${pct(s.highConfidence.withinOne)} of ${s.highConfidence.scripts}`.padStart(13)} ${`${(s.meanLatencyMs / 1000).toFixed(1)}s`.padStart(8)} ` +
      `${(price.input || price.output ? `$${s.meanCostUsd.toFixed(4)}` : "unpriced").padStart(9)} ${String(s.failed).padStart(6)}`,
  );
}

const results: CaseResult[] = [];
for (const c of EVAL_CASES) results.push(await runCase(c));

const byType = Object.fromEntries((["short", "maths", "essay"] as const).map((t) => [t, summarise(results.filter((r) => r.workType === t))]));
const overall = summarise(results);
const synthetic = EVAL_CASES.filter((c) => !/teacher/i.test(c.reference.markedBy) || /not a teacher/i.test(c.reference.markedBy)).length;

console.log(`\nRed Pen evaluation · provider ${provider.name} · prompt ${PROMPT_VERSION} · ${results[0]?.model ?? ""}\n`);
console.log("type      scripts  exact line  within one  high conf ok  latency      cost failed");
for (const [t, s] of Object.entries(byType)) printRow(t, s);
printRow("all", overall);
for (const r of results.filter((x) => !x.ok)) console.log(`  ${r.id} failed: ${r.error}`);
for (const r of results.filter((x) => x.ok && !x.withinOne)) console.log(`  ${r.id}: AI ${r.aiTotal} vs reference ${r.referenceTotal} (${r.ai.join(",")} vs ${r.reference.join(",")})`);
if (provider.name === "demo") {
  console.log("\nNOTE: demo provider. These figures compare fixed demo results with the reference marks. They say nothing about the AI.");
}
if (synthetic > 0) {
  console.log(`NOTE: ${synthetic} of ${EVAL_CASES.length} cases have synthetic reference marks (written by Claude, not a teacher). Do not quote these figures as teacher agreement.`);
}

const report = { date: new Date().toISOString(), provider: provider.name, promptVersion: PROMPT_VERSION, model: results[0]?.model ?? null, syntheticReferences: synthetic, overall, byType, results };
mkdirSync(path.join(EVAL_DIR, "reports"), { recursive: true });
writeFileSync(path.join(EVAL_DIR, "reports", `latest-${provider.name}.json`), JSON.stringify(report, null, 2) + "\n");

const baselinePath = path.join(EVAL_DIR, "baseline.json");
if (args.has("--update-baseline")) {
  if (provider.name !== "claude") {
    console.error("\nRefusing to record a demo run as the baseline.");
    process.exit(1);
  }
  writeFileSync(baselinePath, JSON.stringify({ date: report.date, promptVersion: PROMPT_VERSION, model: report.model, withinOneMark: overall.withinOneMark, exactLineAgreement: overall.exactLineAgreement }, null, 2) + "\n");
  console.log(`\nBaseline updated: within one mark ${pct(overall.withinOneMark)}.`);
}

if (args.has("--check")) {
  const maxDrop = Number(process.env.EVAL_MAX_DROP ?? 0.05);
  if (provider.name !== "claude") {
    console.log("\n::warning::Evaluation ran with the demo provider (no ANTHROPIC_API_KEY), so agreement was not measured. Add the secret to run it against the AI.");
  } else if (!existsSync(baselinePath)) {
    console.log("\n::warning::No eval/baseline.json yet. Record one with --update-baseline after reviewing this run.");
  } else {
    const baseline = JSON.parse(readFileSync(baselinePath, "utf8")) as { withinOneMark: number; promptVersion: string };
    const drop = baseline.withinOneMark - overall.withinOneMark;
    console.log(`\nBaseline (prompt ${baseline.promptVersion}): within one mark ${pct(baseline.withinOneMark)}. This run: ${pct(overall.withinOneMark)}. Allowed drop ${pct(maxDrop)}.`);
    if (drop > maxDrop) {
      console.error(`::error::Agreement within one mark dropped by ${(drop * 100).toFixed(0)} points, more than the allowed ${(maxDrop * 100).toFixed(0)}.`);
      process.exit(1);
    }
  }
  if (overall.failed > 0) {
    console.error(`::error::${overall.failed} script(s) failed to mark.`);
    process.exit(1);
  }
}
