import { seedFoundation } from "./lib/fixtures";
import { assertNonProduction, requireEnv } from "./lib/guard";
import { migrate, resetSchema } from "./lib/migrate";

assertNonProduction("reset the database");
const url = requireEnv("DATABASE_ADMIN_URL");
await resetSchema(url);
await migrate(url);
await seedFoundation(url, requireEnv("PUPIL_NAME_KEY"));
console.log("Database reset, migrated and seeded.");
