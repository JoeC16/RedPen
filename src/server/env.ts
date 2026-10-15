import { z } from "zod";

// Every setting the server reads lives here and is documented in .env.example.
// Parsed lazily so `next build` does not need runtime secrets.
const schema = z.object({
  DATABASE_URL: z.string().url(),
  PUPIL_NAME_KEY: z
    .string()
    .refine((v) => Buffer.from(v, "base64").length === 32, "must be 32 bytes, base64-encoded"),
  SESSION_MAX_AGE_HOURS: z.coerce.number().positive().max(24).default(8),
  LOGIN_MAX_FAILURES_PER_EMAIL: z.coerce.number().int().positive().default(5),
  LOGIN_MAX_FAILURES_PER_IP: z.coerce.number().int().positive().default(30),
  LOGIN_WINDOW_MINUTES: z.coerce.number().int().positive().default(15),
});

export type Env = z.infer<typeof schema>;

let cached: Env | undefined;

export function env(): Env {
  if (!cached) {
    const parsed = schema.safeParse(process.env);
    if (!parsed.success) {
      const problems = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`);
      throw new Error(`Invalid environment configuration:\n  ${problems.join("\n  ")}`);
    }
    cached = parsed.data;
  }
  return cached;
}
