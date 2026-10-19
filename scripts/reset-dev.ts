import { seedDemo } from "./lib/demo-seed";
import { seedFoundation } from "./lib/fixtures";
import { assertNonProduction, requireEnv } from "./lib/guard";
import { migrate, resetSchema } from "./lib/migrate";

assertNonProduction("reset the database");
const url = requireEnv("DATABASE_ADMIN_URL");
await resetSchema(url, process.env.DATABASE_URL);
await migrate(url);
await seedFoundation(url, requireEnv("PUPIL_NAME_KEY"));
// --foundation-only skips the full demo dataset (faster; what the tests use).
if (!process.argv.includes("--foundation-only")) await seedDemo(url, requireEnv("PUPIL_NAME_KEY"));
console.log("Database reset, migrated and seeded.");
