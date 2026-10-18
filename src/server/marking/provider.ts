import type { Criterion, WorkType } from "./marks";
import type { MarkingResult } from "./result-schema";

export type MarkingRequest = {
  workType: WorkType;
  schemeText: string;
  totalMarks: number;
  criteria: Criterion[];
  /** Redacted typed work. Never contains pupil or staff names. */
  pupilText: string;
};

export type ProviderResponse = {
  /** Raw model output, before validation. */
  raw: unknown;
  model: string;
  promptVersion: string;
  tokensIn: number;
  tokensOut: number;
  cacheReadTokens: number;
  latencyMs: number;
  /** True when the provider proposed no marks at all (demo placeholder). */
  placeholder?: boolean;
};

/** A provider-level failure the teacher can act on (shown as the failure reason). */
export class ProviderError extends Error {
  constructor(
    message: string,
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = "ProviderError";
  }
}

/** All model access goes through this interface (CLAUDE.md, marking engine). */
export interface MarkingProvider {
  readonly name: "claude" | "demo";
  mark(request: MarkingRequest): Promise<ProviderResponse>;
}

export type { MarkingResult };
