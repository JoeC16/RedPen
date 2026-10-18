import { createHash } from "node:crypto";
import { EVAL_CASES } from "../../../eval/cases";
import type { MarkingProvider, MarkingRequest, ProviderResponse } from "./provider";
import { PROMPT_VERSION } from "./prompt";
import type { MarkingResult } from "./result-schema";

const norm = (s: string) => s.replace(/\s+/g, " ").trim();

/** Key for a fixed demo result: the work type, scheme and pupil work, whitespace-normalised. */
export function demoKey(workType: string, schemeText: string, pupilText: string): string {
  return createHash("sha256").update(`${workType}\n${norm(schemeText)}\n${norm(pupilText)}`).digest("hex");
}

const FIXED = new Map<string, MarkingResult>(
  EVAL_CASES.map((c) => [demoKey(c.workType, c.schemeText, c.pupilWork), c.demoResult]),
);

/**
 * Demo mode (MARKING_MODE=demo, or no API key): realistic fixed results for the
 * demo pupils so a demo never depends on the network. Any other work gets a
 * clearly labelled placeholder, never a pretend mark.
 */
export class DemoProvider implements MarkingProvider {
  readonly name = "demo" as const;

  async mark(req: MarkingRequest): Promise<ProviderResponse> {
    const started = Date.now();
    const fixed = FIXED.get(demoKey(req.workType, req.schemeText, req.pupilText));
    const raw: MarkingResult = fixed ?? {
      transcription: "",
      criteria: req.criteria.map((c) => ({
        point: c.label,
        awarded: 0,
        max: c.max,
        evidence: "",
        comment: "Demo mode placeholder: no mark proposed.",
      })),
      feedback: "",
      confidence: "low",
      flags: ["Demo mode: this work is not one of the demo examples, so no marks were proposed. Mark it yourself."],
    };
    return {
      raw: structuredClone(raw),
      model: "demo",
      promptVersion: PROMPT_VERSION,
      tokensIn: 0,
      tokensOut: 0,
      cacheReadTokens: 0,
      latencyMs: Date.now() - started,
      placeholder: !fixed,
    };
  }
}
