import { ClaudeProvider } from "./claude";
import { DemoProvider } from "./demo";
import type { MarkingProvider } from "./provider";

export type MarkingMode = "claude" | "demo";

/** Demo mode when MARKING_MODE=demo or no API key is set. The UI shows a banner. */
export function markingMode(): MarkingMode {
  if (process.env.MARKING_MODE === "demo") return "demo";
  return process.env.ANTHROPIC_API_KEY ? "claude" : "demo";
}

const EFFORTS = ["low", "medium", "high", "xhigh", "max"] as const;

function claudeFromEnv(): ClaudeProvider {
  const model = process.env.ANTHROPIC_MODEL?.trim();
  if (!model) throw new Error("ANTHROPIC_MODEL must be set when MARKING_MODE is not demo (see .env.example).");
  const effortEnv = process.env.MARKING_EFFORT?.trim() || "high";
  const effort = EFFORTS.find((e) => e === effortEnv);
  return new ClaudeProvider({
    apiKey: process.env.ANTHROPIC_API_KEY!,
    model,
    effort, // "default" or anything unrecognised leaves the model's own default
    fallbacks: (process.env.ANTHROPIC_FALLBACKS ?? "default") === "default",
    inferenceGeo: process.env.ANTHROPIC_INFERENCE_GEO?.trim() || undefined,
  });
}

let provider: MarkingProvider | undefined;
let override: MarkingProvider | undefined;

export function getProvider(): MarkingProvider {
  if (override) return override;
  provider ??= markingMode() === "demo" ? new DemoProvider() : claudeFromEnv();
  return provider;
}

/** Tests only: swap in a provider (e.g. a mocked Claude client). */
export function setProviderForTests(p: MarkingProvider | undefined): void {
  override = p;
}
