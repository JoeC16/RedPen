import Anthropic from "@anthropic-ai/sdk";
import type { MarkingProvider, MarkingRequest, ProviderResponse } from "./provider";
import { ProviderError } from "./provider";
import { buildPrompt, PROMPT_VERSION } from "./prompt";
import { markingResultJsonSchema } from "./result-schema";

type Effort = "low" | "medium" | "high" | "xhigh" | "max";

export type ClaudeConfig = {
  apiKey: string;
  /** From ANTHROPIC_MODEL. Never hard-coded. */
  model: string;
  /** From MARKING_EFFORT; undefined leaves the model's default. */
  effort?: Effort;
  /** Server-side fallback on a policy decline (ANTHROPIC_FALLBACKS=default). */
  fallbacks: boolean;
  /** Optional ANTHROPIC_INFERENCE_GEO, passed through as inference_geo. */
  inferenceGeo?: string;
};

const FALLBACK_BETA = "server-side-fallback-2026-07-01";

/**
 * Calls the Anthropic Messages API with structured JSON output. The result is
 * returned raw; the engine validates it with zod and retries once if invalid.
 * The system prompt (instructions + scheme) is the same for a whole class and
 * is marked for prompt caching; only the pupil's work varies.
 */
export class ClaudeProvider implements MarkingProvider {
  readonly name = "claude" as const;
  private readonly client: Anthropic;

  constructor(
    private readonly config: ClaudeConfig,
    client?: Anthropic,
  ) {
    this.client = client ?? new Anthropic({ apiKey: config.apiKey, maxRetries: 2, timeout: 120_000 });
  }

  async mark(req: MarkingRequest): Promise<ProviderResponse> {
    const { system, user } = buildPrompt(req);
    const started = Date.now();
    let message: Anthropic.Beta.BetaMessage;
    try {
      message = await this.client.beta.messages.create({
        model: this.config.model,
        max_tokens: 16000,
        system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
        messages: [{ role: "user", content: user }],
        output_config: {
          format: { type: "json_schema", schema: markingResultJsonSchema as unknown as Record<string, unknown> },
          ...(this.config.effort ? { effort: this.config.effort } : {}),
        },
        ...(this.config.fallbacks ? { betas: [FALLBACK_BETA], fallbacks: "default" as const } : {}),
        ...(this.config.inferenceGeo ? { inference_geo: this.config.inferenceGeo } : {}),
      });
    } catch (err) {
      throw toProviderError(err);
    }
    const latencyMs = Date.now() - started;

    if (message.stop_reason === "refusal") {
      throw new ProviderError("The AI declined to mark this work. Please mark it yourself.", false);
    }
    const text = message.content
      .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");
    let raw: unknown = text;
    try {
      raw = JSON.parse(text);
    } catch {
      // Left as text; schema validation reports it and the engine retries once.
    }
    const u = message.usage;
    const cacheRead = u.cache_read_input_tokens ?? 0;
    return {
      raw,
      // The model that actually answered (differs from the request after a fallback).
      model: message.model,
      promptVersion: PROMPT_VERSION,
      tokensIn: u.input_tokens + (u.cache_creation_input_tokens ?? 0) + cacheRead,
      tokensOut: u.output_tokens,
      cacheReadTokens: cacheRead,
      latencyMs,
    };
  }
}

function toProviderError(err: unknown): ProviderError {
  if (err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.PermissionDeniedError) {
    return new ProviderError("The AI service rejected the server's credentials. Ask your administrator to check the API key.", false);
  }
  if (err instanceof Anthropic.NotFoundError) {
    return new ProviderError("The configured AI model was not found. Ask your administrator to check ANTHROPIC_MODEL.", false);
  }
  if (err instanceof Anthropic.BadRequestError) {
    return new ProviderError("The AI service could not process this request.", false);
  }
  if (err instanceof Anthropic.RateLimitError) {
    return new ProviderError("The AI service is busy. This work will be retried.", true);
  }
  if (err instanceof Anthropic.InternalServerError || err instanceof Anthropic.APIConnectionError) {
    return new ProviderError("The AI service could not be reached. This work will be retried.", true);
  }
  if (err instanceof Anthropic.APIError) {
    return new ProviderError(`The AI service returned an error (${err.status ?? "unknown"}).`, (err.status ?? 500) >= 500);
  }
  return new ProviderError("Marking failed unexpectedly.", true);
}
