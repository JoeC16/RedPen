// Resets the e2e database. Runs as part of the web server command, so it
// always finishes before the app (and its queue worker) connects.
// DEMO_DATASET=1 also seeds the full demo dataset (playwright.demo.config.ts),
// creating its database first if needed.
import postgres from "postgres";
import { seedDemo } from "../scripts/lib/demo-seed";
import { seedFoundation } from "../scripts/lib/fixtures";
import { migrate, resetSchema } from "../scripts/lib/migrate";

const url = process.env.DATABASE_ADMIN_URL!;
if (process.env.DEMO_DATASET === "1") {
  const name = new URL(url).pathname.slice(1);
  const admin = postgres(url.replace(/\/[^/]+$/, "/postgres"), { max: 1, onnotice: () => {} });
  const [exists] = await admin`select 1 from pg_database where datname = ${name}`;
  if (!exists) await admin.unsafe(`create database "${name}"`);
  await admin.end();
}
await resetSchema(url, process.env.DATABASE_URL);
await migrate(url, () => {});
await seedFoundation(url, process.env.PUPIL_NAME_KEY!);
if (process.env.DEMO_DATASET === "1") await seedDemo(url, process.env.PUPIL_NAME_KEY!);
console.log("e2e database reset");
