// Proves a restore is good: every table has the same rows as the source, and
// the protections came back too (row-level security, lock triggers, the
// append-only audit log, the app role's grants). Exits non-zero on any difference.
//   DATABASE_ADMIN_URL=<source> RESTORED_ADMIN_URL=<restored> RESTORED_APP_URL=<restored as app role> npx tsx scripts/verify-restore.ts
import postgres from "postgres";

const source = postgres(process.env.DATABASE_ADMIN_URL!, { max: 1, onnotice: () => {} });
const restored = postgres(process.env.RESTORED_ADMIN_URL!, { max: 1, onnotice: () => {} });
const restoredApp = postgres(process.env.RESTORED_APP_URL!, { max: 1, onnotice: () => {} });
const problems: string[] = [];

const tables = (await source<{ t: string }[]>`select tablename as t from pg_tables where schemaname = 'public' order by 1`).map((r) => r.t);
for (const t of tables) {
  // A fingerprint of every row, not just a count.
  const q = (db: postgres.Sql) => db.unsafe(`select count(*)::int as n, coalesce(md5(string_agg(md5(x::text), '' order by md5(x::text))), '') as h from "${t}" x`);
  const [a] = await q(source);
  const [b] = await q(restored);
  if (a!.n !== b!.n || a!.h !== b!.h) problems.push(`${t}: ${a!.n} rows in the source, ${b!.n} restored${a!.n === b!.n ? " (contents differ)" : ""}`);
}

const shape = async (db: postgres.Sql) => ({
  policies: (await db`select count(*)::int n from pg_policies where schemaname = 'public'`)[0]!.n,
  rls: (await db`select count(*)::int n from pg_class c join pg_namespace s on s.oid = c.relnamespace where s.nspname = 'public' and c.relrowsecurity`)[0]!.n,
  triggers: (await db`select count(*)::int n from pg_trigger t join pg_class c on c.oid = t.tgrelid join pg_namespace s on s.oid = c.relnamespace where s.nspname = 'public' and not t.tgisinternal`)[0]!.n,
  functions: (await db`select count(*)::int n from pg_proc p join pg_namespace s on s.oid = p.pronamespace where s.nspname = 'public'`)[0]!.n,
});
const [sa, sb] = [await shape(source), await shape(restored)];
for (const k of Object.keys(sa) as (keyof typeof sa)[]) if (sa[k] !== sb[k]) problems.push(`${k}: ${sa[k]} in the source, ${sb[k]} restored`);

// The audit log is still append-only, even for the owner.
try {
  await restored`update audit_event set action = 'x.y' where id = (select min(id) from audit_event)`;
  problems.push("audit_event accepted an update after restore");
} catch {
  /* expected */
}
// The app role still sees nothing without a tenancy context, and only its own school with one.
const [none] = await restoredApp`select count(*)::int n from submission`;
if (none!.n !== 0) problems.push(`the app role sees ${none!.n} submissions with no tenancy context`);
const [teacher] = await source`select u.id, u.school_id, u.authority_id from app_user u join class_teacher ct on ct.user_id = u.id limit 1`;
const seen = await restoredApp.begin(async (tx) => {
  await tx`select set_config('app.user_id', ${teacher!.id}, true), set_config('app.role', 'teacher', true),
                  set_config('app.school_id', ${teacher!.school_id}, true), set_config('app.authority_id', ${teacher!.authority_id}, true)`;
  return tx`select distinct school_id from submission`;
});
if (seen.some((r) => r.school_id !== teacher!.school_id)) problems.push("a teacher can see another school's work after restore");

await Promise.all([source.end(), restored.end(), restoredApp.end()]);
if (problems.length) {
  console.error(`Restore check FAILED:\n  ${problems.join("\n  ")}`);
  process.exit(1);
}
console.log(`Restore check passed: ${tables.length} tables identical row for row; ${sb.policies} policies, ${sb.triggers} triggers and ${sb.functions} functions restored; audit log still append-only; tenancy still enforced.`);
