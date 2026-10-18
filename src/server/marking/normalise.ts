import { clampMark, type Criterion } from "./marks";
import type { MarkingResult } from "./result-schema";

export type NormalisedLine = {
  label: string;
  max: number;
  awarded: number;
  evidence: string;
  comment: string;
};

export type NormalisedResult = {
  lines: NormalisedLine[];
  feedback: string;
  confidence: "high" | "medium" | "low";
  flags: string[];
  transcription: string;
};

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/**
 * Fit a model result onto the teacher's mark lines. The scheme is the
 * authority: its labels and maxima win. Every awarded mark is rounded to the
 * nearest half and clamped to 0..max. Anything that had to be corrected, and
 * any injection attempt found locally, becomes a flag for the teacher.
 */
export function normaliseResult(
  result: MarkingResult,
  criteria: Criterion[],
  totalMarks: number,
  localFlags: string[] = [],
): NormalisedResult {
  const flags = [...result.flags.map((f) => clip(f.trim(), 300)).filter(Boolean)];
  const byLabel = new Map(result.criteria.map((c) => [c.point.trim().toLowerCase(), c]));
  const sameCount = result.criteria.length === criteria.length;

  const modelMaxSum = result.criteria.reduce((n, c) => n + c.max, 0);
  if (modelMaxSum !== totalMarks) {
    flags.push(`The AI's line maxima add up to ${modelMaxSum}, not the total of ${totalMarks}. Marks were fitted to your scheme; check each line.`);
  }
  if (!sameCount) {
    flags.push(`The AI returned ${result.criteria.length} mark lines for a scheme with ${criteria.length}. Check each line.`);
  }

  const lines = criteria.map((c, i) => {
    const m = byLabel.get(c.label.trim().toLowerCase()) ?? (sameCount ? result.criteria[i] : undefined);
    if (!m) {
      flags.push(`${c.label}: the AI gave no mark. It is set to 0 for you to decide.`);
      return { label: c.label, max: c.max, awarded: 0, evidence: "", comment: "No mark proposed." };
    }
    if (m.max !== c.max) flags.push(`${c.label}: the AI read the maximum as ${m.max}; your scheme says ${c.max}.`);
    const awarded = clampMark(m.awarded, c.max);
    if (awarded !== m.awarded) {
      flags.push(`${c.label}: the AI proposed ${m.awarded}, which was adjusted to ${awarded} (whole or half marks, 0 to ${c.max}).`);
    }
    return { label: c.label, max: c.max, awarded, evidence: clip(m.evidence.trim(), 200), comment: clip(m.comment.trim(), 300) };
  });

  const allFlags = [...localFlags, ...flags];
  return {
    lines,
    feedback: clip(result.feedback.trim(), 2000),
    // A local injection hit always surfaces the work first, whatever the model said.
    confidence: localFlags.length > 0 ? "low" : result.confidence,
    flags: [...new Set(allFlags)],
    transcription: result.transcription,
  };
}
