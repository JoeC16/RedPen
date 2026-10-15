import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { env } from "../env";
import * as schema from "./schema";

// The app connects as `redpen_app`, which is subject to row-level security.
// Never import this from client components.
const globalForDb = globalThis as unknown as { redpenSql?: postgres.Sql };

function sqlClient(): postgres.Sql {
  if (!globalForDb.redpenSql) {
    globalForDb.redpenSql = postgres(env().DATABASE_URL, {
      max: 10,
      idle_timeout: 30,
      connection: { application_name: "redpen-app" },
    });
  }
  return globalForDb.redpenSql;
}

let cachedDb: ReturnType<typeof makeDb> | undefined;
function makeDb() {
  return drizzle(sqlClient(), { schema });
}

export function db() {
  cachedDb ??= makeDb();
  return cachedDb;
}

export type Db = ReturnType<typeof db>;
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

export async function closeDb() {
  await globalForDb.redpenSql?.end({ timeout: 5 });
  globalForDb.redpenSql = undefined;
  cachedDb = undefined;
}
