import { DEMO_PASSWORD, EMAILS, seedFoundation } from "./lib/fixtures";
import { assertNonProduction, requireEnv } from "./lib/guard";

assertNonProduction("seed demo data");
await seedFoundation(requireEnv("DATABASE_ADMIN_URL"), requireEnv("PUPIL_NAME_KEY"));
console.log(`Seeded. Every demo login uses the password "${DEMO_PASSWORD}":`);
for (const [k, v] of Object.entries(EMAILS)) console.log(`  ${k.padEnd(22)} ${v}`);
