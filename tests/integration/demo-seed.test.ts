// The demo dataset seeds cleanly into a fresh database and is believable: every
// state is present, dashboards have real rows to count, and the live class can
// be marked in demo mode. Uses its own scratch database.
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { demoResultFor } from "@/server/demo/marker";
import { seedDemo } from "../../scripts/lib/demo-seed";
import { seedFoundation } from "../../scripts/lib/fixtures";
import { migrate } from "../../scripts/lib/migrate";

const KEY = "dGVzdC1vbmx5LXB1cGlsLW5hbWUta2V5LTMyLWJ5dGU=";
const adminUrl = process.env.DATABASE_ADMIN_URL!;
const scratch = adminUrl.replace(/\/[^/]+$/, "/redpen_demo_scratch");
let db: postgres.Sql;
let counts: Awaited<ReturnType<typeof seedDemo>>;

beforeAll(async () => {
  const admin = postgres(adminUrl, { max: 1, onnotice: () => {} });
  await admin.unsafe("drop database if exists redpen_demo_scratch with (force)");
  await admin.unsafe("create database redpen_demo_scratch");
  await admin.end();
  await migrate(scratch, () => {});
  await seedFoundation(scratch, KEY);
  counts = await seedDemo(scratch, KEY);
  db = postgres(scratch, { max: 1, onnotice: () => {} });
}, 120_000);

afterAll(async () => {
  await db?.end();
  const admin = postgres(adminUrl, { max: 1, onnotice: () => {} });
  await admin.unsafe("drop database if exists redpen_demo_scratch with (force)");
  await admin.end();
});

describe("demo dataset", () => {
  it("has the size the brief asks for", async () => {
    expect(counts.classes).toBeGreaterThanOrEqual(16);
    expect(counts.submissions).toBeGreaterThan(500);
    const [t] = await db`select count(*)::int n from app_user where role = 'teacher' and authority_id = ${"00000000-0000-4000-8000-000000000001"} and disabled_at is null`;
    expect(t!.n).toBeGreaterThanOrEqual(10);
    const types = await db`select distinct work_type from assignment`;
    expect(types.map((r) => r.work_type).sort()).toEqual(["essay", "maths", "short"]);
  });

  it("has work in every state, flagged work and teacher changes", async () => {
    const states = await db`select status, count(*)::int n from submission group by 1`;
    for (const s of ["todo", "review", "approved", "failed"]) expect(states.find((r) => r.status === s)?.n ?? 0, s).toBeGreaterThan(0);
    const [f] = await db`select count(*)::int n from mark_result where jsonb_array_length(flags) > 0`;
    expect(f!.n).toBeGreaterThan(10);
    const [c] = await db`select count(*)::int n from approval where lines_changed > 0`;
    expect(c!.n).toBeGreaterThan(10);
  });

  it("spans six weeks, and the oldest work has been through retention", async () => {
    const [span] = await db`select extract(day from max(approved_at) - min(approved_at))::int days from approval`;
    expect(span!.days).toBeGreaterThanOrEqual(28);
    const [r] = await db`select count(*)::int n from submission where content_deleted_at is not null`;
    expect(r!.n).toBeGreaterThan(0);
    expect(await db`select 1 from audit_event where action = 'retention.deleted'`).not.toHaveLength(0);
  });

  it("keeps the database's own rules: approved work has every final mark and an approval", async () => {
    const bad = await db`
      select s.id from submission s
      where s.status = 'approved' and (
        not exists (select 1 from approval a where a.submission_id = s.id and a.reopened_at is null)
        or exists (select 1 from mark_line l join mark_result m on m.id = l.mark_result_id where m.submission_id = s.id and l.final_awarded is null))`;
    expect(bad).toHaveLength(0);
  });

  it("every unmarked piece of work in the live class is one DemoProvider can mark", async () => {
    const rows = await db`
      select a.work_type, a.scheme_text, s.text from submission s join assignment a on a.id = s.assignment_id
      join class c on c.id = a.class_id where c.name = '10M1' and a.title = 'Algebra and area' and s.status = 'todo' and s.text is not null`;
    expect(rows.length).toBe(30);
    for (const r of rows) expect(demoResultFor(String(r.work_type), String(r.scheme_text), String(r.text))).not.toBeNull();
  });
});
