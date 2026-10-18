import type { Criterion } from "./marks";
import { normaliseResult, type NormalisedResult } from "./normalise";
import type { MarkingProvider, MarkingRequest, ProviderResponse } from "./provider";
import { ProviderError } from "./provider";
import { detectInjection } from "./redact";
import { markingResultSchema } from "./result-schema";

export type Proposal = NormalisedResult & {
  meta: Omit<ProviderResponse, "raw">;
  attempts: number;
};

/**
 * One marking proposal: call the provider, validate the result against the
 * schema (retrying once if it is invalid), then fit it to the teacher's lines.
 * Shared by the job worker and the evaluation harness, so the harness measures
 * exactly what teachers see.
 */
export async function propose(
  provider: MarkingProvider,
  request: MarkingRequest,
  criteria: Criterion[],
  /** The work before redaction, for the local injection check. */
  originalText: string,
): Promise<Proposal> {
  const totals = { tokensIn: 0, tokensOut: 0, cacheReadTokens: 0, latencyMs: 0 };
  for (let attempt = 1; attempt <= 2; attempt++) {
    const res = await provider.mark(request);
    totals.tokensIn += res.tokensIn;
    totals.tokensOut += res.tokensOut;
    totals.cacheReadTokens += res.cacheReadTokens;
    totals.latencyMs += res.latencyMs;
    const parsed = markingResultSchema.safeParse(res.raw);
    if (parsed.success) {
      const normalised = normaliseResult(parsed.data, criteria, request.totalMarks, detectInjection(originalText));
      return { ...normalised, meta: { ...res, ...totals }, attempts: attempt };
    }
  }
  throw new ProviderError(
    "The AI's answer was not in the expected format, twice. Try again, or mark this work by hand.",
    false,
  );
}

export type { Criterion };
