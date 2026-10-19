import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import postgres from "postgres";

// MIGRATIONS_DIR is set in the production image, where scripts are bundled elsewhere.
const MIGRATIONS_DIR = process.env.MIGRATIONS_DIR ?? path.resolve(import.meta.dirname, "../../db/migrations");

/**
 * Apply db/migrations/*.sql in filename order, each in its own transaction.
 * Applied files are recorded with a checksum; editing an applied migration is
 * an error (write a new one instead).
 */
export async function migrate(adminUrl: string, log: (msg: string) => void = console.log): Promise<string[]> {
  const sql = postgres(adminUrl, { max: 1, onnotice: () => {} });
  try {
    await sql`create table if not exists schema_migrations (
      version text primary key,
      checksum text not null,
      applied_at timestamptz not null default now()
    )`;
    const applied = new Map(
      (await sql<{ version: string; checksum: string }[]>`select version, checksum from schema_migrations`).map((r) => [
        r.version,
        r.checksum,
      ]),
    );
    const files = (await readdir(MIGRATIONS_DIR)).filter((f) => /^\d{4}_.+\.sql$/.test(f)).sort();
    const ran: string[] = [];
    for (const file of files) {
      const body = await readFile(path.join(MIGRATIONS_DIR, file), "utf8");
      const checksum = createHash("sha256").update(body).digest("hex");
      const previous = applied.get(file);
      if (previous) {
        if (previous !== checksum) throw new Error(`Migration ${file} was edited after it was applied`);
        continue;
      }
      await sql.begin(async (tx) => {
        await tx.unsafe(body);
        await tx`insert into schema_migrations (version, checksum) values (${file}, ${checksum})`;
      });
      log(`applied ${file}`);
      ran.push(file);
    }
    return ran;
  } finally {
    await sql.end();
  }
}

/**
 * Drop and recreate the public schema. Only for dev and test databases. The
 * pg-boss schema belongs to the app role, so it is dropped with appUrl if given.
 */
export async function resetSchema(adminUrl: string, appUrl?: string): Promise<void> {
  if (appUrl) {
    const app = postgres(appUrl, { max: 1, onnotice: () => {} });
    try {
      await app.unsafe("drop schema if exists pgboss cascade");
    } finally {
      await app.end();
    }
  }
  const sql = postgres(adminUrl, { max: 1, onnotice: () => {} });
  try {
    await sql.unsafe("drop schema if exists public cascade; create schema public;");
    await sql.unsafe("drop type if exists user_role cascade");
  } finally {
    await sql.end();
  }
}
