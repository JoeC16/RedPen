// The evaluation cases, imported statically so the app (DemoProvider) and the
// harness read the same files. Add a case: drop a JSON file in the folder for
// its work type and list it here.
import { z } from "zod";
import essay01 from "./essay/essay-01.json";
import essay02 from "./essay/essay-02.json";
import maths01 from "./maths/maths-01.json";
import maths02 from "./maths/maths-02.json";
import maths03 from "./maths/maths-03.json";
import short01 from "./short/short-01.json";
import short02 from "./short/short-02.json";
import short03 from "./short/short-03.json";
import { markingResultSchema } from "../src/server/marking/result-schema";

export const evalCaseSchema = z.object({
  id: z.string(),
  provenance: z.string(),
  workType: z.enum(["short", "maths", "essay"]),
  title: z.string(),
  yearGroup: z.number().int(),
  subject: z.string(),
  schemeText: z.string(),
  totalMarks: z.number().int(),
  criteria: z.array(z.object({ label: z.string(), max: z.number().int() })),
  pupilWork: z.string(),
  reference: z.object({ marks: z.array(z.number()), markedBy: z.string(), notes: z.string() }),
  /** What DemoProvider returns for this pupil. Not used to score the real AI. */
  demoResult: markingResultSchema,
});
export type EvalCase = z.infer<typeof evalCaseSchema>;

export const EVAL_CASES: EvalCase[] = [short01, short02, short03, maths01, maths02, maths03, essay01, essay02].map((c) =>
  evalCaseSchema.parse(c),
);
