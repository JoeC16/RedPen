import { z } from "zod";

/** The marking contract from CLAUDE.md Appendix A, validated on every response. */
export const markingResultSchema = z.object({
  transcription: z.string(),
  criteria: z
    .array(
      z.object({
        point: z.string().min(1),
        awarded: z.number(),
        max: z.number(),
        evidence: z.string(),
        comment: z.string(),
      }),
    )
    .min(1),
  feedback: z.string(),
  confidence: z.enum(["high", "medium", "low"]),
  flags: z.array(z.string()),
});
export type MarkingResult = z.infer<typeof markingResultSchema>;

/**
 * The same shape as JSON Schema for the API's structured outputs. Written by
 * hand (not generated) so it only uses keywords structured outputs accepts.
 */
export const markingResultJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["transcription", "criteria", "feedback", "confidence", "flags"],
  properties: {
    transcription: { type: "string" },
    criteria: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["point", "awarded", "max", "evidence", "comment"],
        properties: {
          point: { type: "string" },
          awarded: { type: "number" },
          max: { type: "number" },
          evidence: { type: "string" },
          comment: { type: "string" },
        },
      },
    },
    feedback: { type: "string" },
    confidence: { type: "string", enum: ["high", "medium", "low"] },
    flags: { type: "array", items: { type: "string" } },
  },
} as const;
