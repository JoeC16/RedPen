// The SQL migrations are the source of truth; the Drizzle definitions used for
// typed queries must match them column for column.
import { getTableColumns, getTableName, is } from "drizzle-orm";
import { PgTable } from "drizzle-orm/pg-core";
import { afterAll, describe, expect, it } from "vitest";
import * as schema from "@/server/db/schema";
import { adminConn } from "../helpers";

afterAll(() => adminConn().end());

const tables = Object.values(schema).filter((v) => is(v, PgTable)) as unknown as PgTable[];

describe("drizzle schema matches the migrated database", () => {
  it("defines every table in the database", async () => {
    const db = await adminConn()<{ table_name: string }[]>`
      select table_name from information_schema.tables
      where table_schema = 'public' and table_type = 'BASE TABLE' and table_name <> 'schema_migrations'`;
    expect(tables.map((t) => getTableName(t)).sort()).toEqual(db.map((r) => r.table_name).sort());
  });

  for (const table of tables) {
    it(`${getTableName(table)} columns and nullability match`, async () => {
      const db = await adminConn()<{ column_name: string; is_nullable: string }[]>`
        select column_name, is_nullable from information_schema.columns
        where table_schema = 'public' and table_name = ${getTableName(table)}`;
      const actual = Object.fromEntries(db.map((c) => [c.column_name, c.is_nullable === "YES"]));
      const declared = Object.fromEntries(Object.values(getTableColumns(table)).map((c) => [c.name, !c.notNull]));
      expect(declared).toEqual(actual);
    });
  }
});
