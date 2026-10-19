// Resets a demo deployment to a fresh demo dataset, dated to today. Bundled
// into the production image as scripts/demo-reset.mjs (see Dockerfile) and
// refused unless ALLOW_DEMO_SEED=true. Restart the app afterwards: the reset
// recreates the job queue's schema under the running worker.
//   fly ssh console -C "node scripts/demo-reset.mjs" && fly apps restart
import { seedDemo } from "./lib/demo-seed";
import { seedFoundation } from "./lib/fixtures";
import { assertNonProduction, requireEnv } from "./lib/guard";
import { migrate, resetSchema } from "./lib/migrate";

import postgres from "postgres";

assertNonProduction("reset the demo data");
const url = requireEnv("DATABASE_ADMIN_URL");
// --if-empty (used on start-up by a demo deployment): seed only a database with no data yet.
if (process.argv.includes("--if-empty")) {
  const sql = postgres(url, { max: 1, onnotice: () => {} });
  const [row] = await sql`select to_regclass('public.authority') is not null as migrated`;
  const seeded = row?.migrated ? (await sql`select count(*)::int as n from authority`)[0]!.n > 0 : false;
  await sql.end();
  if (seeded) {
    console.log("Demo data already present; not reseeding.");
    process.exit(0);
  }
}
await resetSchema(url, requireEnv("DATABASE_URL"));
await migrate(url);
await seedFoundation(url, requireEnv("PUPIL_NAME_KEY"));
const demo = await seedDemo(url, requireEnv("PUPIL_NAME_KEY"));
console.log(`Demo reset: ${demo.classes} classes, ${demo.pupils} pupils, ${demo.submissions} pieces of work.${process.argv.includes("--if-empty") ? "" : " Now restart the app."}`);
