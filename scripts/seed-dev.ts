import { seedDemo } from "./lib/demo-seed";
import { DEMO_PASSWORD, EMAILS, seedFoundation } from "./lib/fixtures";
import { assertNonProduction, requireEnv } from "./lib/guard";

// The foundation fixture (used by the tests) plus the full demo dataset.
assertNonProduction("seed demo data");
const url = requireEnv("DATABASE_ADMIN_URL");
await seedFoundation(url, requireEnv("PUPIL_NAME_KEY"));
const demo = await seedDemo(url, requireEnv("PUPIL_NAME_KEY"));
console.log(`Seeded ${demo.classes} demo classes, ${demo.pupils} pupils and ${demo.submissions} pieces of work.`);
console.log(`Every demo login uses the password "${DEMO_PASSWORD}":`);
for (const [k, v] of Object.entries(EMAILS)) console.log(`  ${k.padEnd(22)} ${v}`);
