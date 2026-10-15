// Second line of defence: the database enforces tenancy even when a query has
// no WHERE clause at all. Every query here runs as the app role with raw SQL.
import { afterAll, describe, expect, it } from "vitest";
import { closeDb } from "@/server/db/client";
import { IDS, adminConn, appConn, asApp, rawCtxOf } from "../helpers";

afterAll(async () => {
  await appConn().end();
  await adminConn().end();
  await closeDb();
});

const ids = (rows: { id: string }[]) => rows.map((r) => r.id).sort();

describe("app database role", () => {
  it("is not a superuser, cannot bypass RLS and owns no tables", async () => {
    const [role] = await appConn()`select rolsuper, rolbypassrls from pg_roles where rolname = current_user`;
    expect(role).toEqual({ rolsuper: false, rolbypassrls: false });
    const owned = await appConn()`select tablename from pg_tables where schemaname = 'public' and tableowner = current_user`;
    expect(owned).toHaveLength(0);
  });

  it("has row-level security on every tenant table", async () => {
    const rows = await adminConn()<{ relname: string; relrowsecurity: boolean }[]>`
      select c.relname, c.relrowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'r'
        and c.relname not in ('schema_migrations', 'login_attempt')`;
    expect(rows.length).toBeGreaterThanOrEqual(7);
    for (const r of rows) expect(r, r.relname).toMatchObject({ relrowsecurity: true });
  });

  it("login_attempt (the one table without RLS) holds only hashed keys, no tenant data", async () => {
    const cols = await adminConn()`select column_name from information_schema.columns where table_name = 'login_attempt'`;
    expect(cols.map((c) => c.column_name).sort()).toEqual(["created_at", "email_key", "id", "ip_key", "succeeded"]);
  });
});

describe("no tenancy context", () => {
  it("sees nothing", async () => {
    await asApp({}, async (sql) => {
      for (const table of ["authority", "school", "app_user", "class", "class_teacher", "pupil", "audit_event"]) {
        const rows = await sql.unsafe(`select * from ${table}`);
        expect(rows, table).toHaveLength(0);
      }
    });
  });
});

describe("teacher in school A (Northgate)", () => {
  it("sees only their own classes, not colleagues' or other schools'", async () => {
    const ctx = await rawCtxOf("northgateTeacher1");
    const classes = await asApp(ctx, (sql) => sql<{ id: string }[]>`select id from class`);
    expect(ids(classes)).toEqual([IDS.classNorthgateSci, IDS.classNorthgateMaths].sort());
  });

  it("sees only pupils in their own classes", async () => {
    const ctx = await rawCtxOf("northgateTeacher1");
    const pupils = await asApp(ctx, (sql) => sql<{ class_id: string }[]>`select class_id from pupil`);
    expect(pupils).toHaveLength(12);
    expect(new Set(pupils.map((p) => p.class_id))).toEqual(new Set([IDS.classNorthgateSci, IDS.classNorthgateMaths]));
  });

  it("cannot read school B's rows even by id", async () => {
    const ctx = await rawCtxOf("northgateTeacher1");
    await asApp(ctx, async (sql) => {
      expect(await sql`select * from school where id = ${IDS.schoolRiverside}`).toHaveLength(0);
      expect(await sql`select * from class where id = ${IDS.classRiversideSci}`).toHaveLength(0);
      expect(await sql`select * from pupil where school_id = ${IDS.schoolRiverside}`).toHaveLength(0);
      expect(await sql`select * from app_user where id = ${IDS.riversideTeacher}`).toHaveLength(0);
      expect(await sql`select * from class_teacher where school_id = ${IDS.schoolRiverside}`).toHaveLength(0);
    });
  });

  it("sees only their own school and its staff", async () => {
    const ctx = await rawCtxOf("northgateTeacher1");
    await asApp(ctx, async (sql) => {
      expect(ids(await sql<{ id: string }[]>`select id from school`)).toEqual([IDS.schoolNorthgate]);
      const users = await sql<{ school_id: string }[]>`select school_id from app_user`;
      expect(users.every((u) => u.school_id === IDS.schoolNorthgate)).toBe(true);
    });
  });

  it("cannot read the audit log", async () => {
    const ctx = await rawCtxOf("northgateTeacher1");
    expect(await asApp(ctx, (sql) => sql`select * from audit_event`)).toHaveLength(0);
  });

  it("cannot write pupils into school B", async () => {
    const ctx = await rawCtxOf("northgateTeacher1");
    await expect(
      asApp(ctx, (sql) => sql`insert into pupil (class_id, school_id, code) values (${IDS.classRiversideSci}, ${IDS.schoolRiverside}, 'X1')`),
    ).rejects.toThrow(/row-level security/);
    // Mismatched school and class is rejected by the composite foreign key too.
    await expect(
      asApp(ctx, (sql) => sql`insert into pupil (class_id, school_id, code) values (${IDS.classRiversideSci}, ${IDS.schoolNorthgate}, 'X2')`),
    ).rejects.toThrow();
  });

  it("cannot update or delete school B's rows", async () => {
    const ctx = await rawCtxOf("northgateTeacher1");
    await asApp(ctx, async (sql) => {
      expect((await sql`update class set name = 'hacked' where id = ${IDS.classRiversideSci}`).count).toBe(0);
      expect((await sql`delete from pupil where school_id = ${IDS.schoolRiverside}`).count).toBe(0);
      expect((await sql`update app_user set role = 'school_admin' where id = ${IDS.northgateTeacher1}`).count).toBe(0);
    });
  });

  it("cannot claim a context from another school by spoofing only part of it", async () => {
    // A teacher id paired with another school's id sees only classes they teach in that school: none.
    const ctx = { ...(await rawCtxOf("northgateTeacher1")), schoolId: IDS.schoolRiverside };
    expect(await asApp(ctx, (sql) => sql`select * from class`)).toHaveLength(0);
  });
});

describe("school admin in school A", () => {
  it("sees every class in their school and none in school B", async () => {
    const ctx = await rawCtxOf("northgateAdmin");
    const classes = await asApp(ctx, (sql) => sql<{ id: string }[]>`select id from class`);
    expect(ids(classes)).toEqual([IDS.classNorthgateSci, IDS.classNorthgateMaths, IDS.classNorthgateEng].sort());
  });

  it("sees their school's audit events only", async () => {
    const ctx = await rawCtxOf("northgateAdmin");
    await adminConn()`select audit_auth_event('auth.login', ${IDS.riversideTeacher}::uuid, '{}'::jsonb)`;
    await adminConn()`select audit_auth_event('auth.login', ${IDS.northgateTeacher1}::uuid, '{}'::jsonb)`;
    const rows = await asApp(ctx, (sql) => sql<{ school_id: string }[]>`select school_id from audit_event`);
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.school_id === IDS.schoolNorthgate)).toBe(true);
  });

  it("cannot create users in school B or promote anyone to authority admin", async () => {
    const ctx = await rawCtxOf("northgateAdmin");
    await expect(
      asApp(ctx, (sql) => sql`insert into app_user (authority_id, school_id, email, display_name, role)
        values (${IDS.authorityDemo}, ${IDS.schoolRiverside}, 'x@riverside.test', 'X', 'teacher')`),
    ).rejects.toThrow(/row-level security/);
    await expect(
      asApp(ctx, (sql) => sql`update app_user set role = 'authority_admin', school_id = null where id = ${IDS.northgateTeacher2}`),
    ).rejects.toThrow();
  });
});

describe("authority admin", () => {
  it("sees all schools in their authority and none in another authority", async () => {
    const ctx = await rawCtxOf("authorityAdmin");
    const schools = await asApp(ctx, (sql) => sql<{ id: string }[]>`select id from school`);
    expect(ids(schools)).toEqual([IDS.schoolNorthgate, IDS.schoolRiverside, IDS.schoolHillcrest].sort());
  });

  it("cannot open any class, pupil or class assignment", async () => {
    const ctx = await rawCtxOf("authorityAdmin");
    await asApp(ctx, async (sql) => {
      expect(await sql`select * from class`).toHaveLength(0);
      expect(await sql`select * from pupil`).toHaveLength(0);
      expect(await sql`select * from class_teacher`).toHaveLength(0);
    });
  });

  it("cannot see another authority's audit events", async () => {
    await adminConn()`select audit_auth_event('auth.login', ${IDS.otherTeacher}::uuid, '{}'::jsonb)`;
    const ctx = await rawCtxOf("authorityAdmin");
    const rows = await asApp(ctx, (sql) => sql<{ authority_id: string }[]>`select authority_id from audit_event`);
    expect(rows.every((r) => r.authority_id === IDS.authorityDemo)).toBe(true);
  });
});

describe("audit log is append-only", () => {
  it("lets a user append only events attributed to themselves", async () => {
    const ctx = await rawCtxOf("northgateAdmin");
    await asApp(ctx, (sql) => sql`insert into audit_event (actor_id, authority_id, school_id, action)
      values (${IDS.northgateAdmin}, ${IDS.authorityDemo}, ${IDS.schoolNorthgate}, 'test.event')`);
    await expect(
      asApp(ctx, (sql) => sql`insert into audit_event (actor_id, authority_id, school_id, action)
        values (${IDS.northgateTeacher1}, ${IDS.authorityDemo}, ${IDS.schoolNorthgate}, 'test.forged')`),
    ).rejects.toThrow(/row-level security/);
    await expect(
      asApp(ctx, (sql) => sql`insert into audit_event (actor_id, authority_id, school_id, action)
        values (${IDS.northgateAdmin}, ${IDS.authorityDemo}, ${IDS.schoolRiverside}, 'test.other_school')`),
    ).rejects.toThrow(/row-level security/);
  });

  it("rejects update and delete from the app role", async () => {
    const ctx = await rawCtxOf("northgateAdmin");
    await expect(asApp(ctx, (sql) => sql`update audit_event set action = 'x.y'`)).rejects.toThrow(/permission denied/);
    await expect(asApp(ctx, (sql) => sql`delete from audit_event`)).rejects.toThrow(/permission denied/);
  });

  it("rejects update, delete and truncate even from the schema owner", async () => {
    await expect(adminConn()`update audit_event set action = 'x.y'`).rejects.toThrow(/append-only/);
    await expect(adminConn()`delete from audit_event`).rejects.toThrow(/append-only/);
    await expect(adminConn()`truncate audit_event`).rejects.toThrow(/append-only/);
  });
});
