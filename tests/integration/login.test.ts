import { afterAll, describe, expect, it } from "vitest";
import { attemptLogin } from "@/server/auth/login";
import { closeDb } from "@/server/db/client";
import { DEMO_PASSWORD, EMAILS, IDS, adminConn } from "../helpers";

afterAll(async () => {
  await adminConn().end();
  await closeDb();
});

const events = (action: string, userId: string) =>
  adminConn()<{ count: number }[]>`select count(*)::int as count from audit_event where action = ${action} and target_id = ${userId}`;

describe("attemptLogin", () => {
  it("accepts the right password, case-insensitively on email, and audits it", async () => {
    const before = (await events("auth.login", IDS.northgateTeacher1))[0]!.count;
    const res = await attemptLogin({ email: EMAILS.northgateTeacher1.toUpperCase(), password: DEMO_PASSWORD }, "10.0.0.1");
    expect(res).toEqual({ ok: true, userId: IDS.northgateTeacher1, email: EMAILS.northgateTeacher1 });
    expect((await events("auth.login", IDS.northgateTeacher1))[0]!.count).toBe(before + 1);
  });

  it("gives the same answer for a wrong password, an unknown email and a disabled account", async () => {
    expect(await attemptLogin({ email: EMAILS.riversideTeacher, password: "wrong" }, "10.0.0.2")).toEqual({ ok: false, reason: "invalid" });
    expect(await attemptLogin({ email: "nobody@nowhere.test", password: "wrong" }, "10.0.0.2")).toEqual({ ok: false, reason: "invalid" });
    expect(await attemptLogin({ email: EMAILS.northgateDisabled, password: DEMO_PASSWORD }, "10.0.0.2")).toEqual({ ok: false, reason: "invalid" });
    expect((await events("auth.login_failed", IDS.riversideTeacher))[0]!.count).toBeGreaterThan(0);
  });

  it("records a failed attempt against the account as target, never as actor", async () => {
    const rows = await adminConn()<{ actor_id: string | null; school_id: string }[]>`
      select actor_id, school_id from audit_event where action = 'auth.login_failed' and target_id = ${IDS.riversideTeacher}`;
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.actor_id === null && r.school_id === IDS.schoolRiverside)).toBe(true);
  });

  it("rejects malformed input without touching the database", async () => {
    expect(await attemptLogin({ email: "not-an-email", password: "x" }, "")).toEqual({ ok: false, reason: "invalid" });
    expect(await attemptLogin(null, "")).toEqual({ ok: false, reason: "invalid" });
  });

  it("rate limits an account after 5 failures, even with the right password, and audits it", async () => {
    const email = EMAILS.hillcrestAdmin;
    for (let i = 0; i < 5; i++) {
      expect((await attemptLogin({ email, password: `wrong-${i}` }, `10.1.0.${i}`)).ok).toBe(false);
    }
    expect(await attemptLogin({ email, password: DEMO_PASSWORD }, "10.1.0.99")).toEqual({ ok: false, reason: "rate_limited" });
    expect((await events("auth.login_rate_limited", IDS.hillcrestAdmin))[0]!.count).toBe(1);
  });

  it("rate limits an IP address across many accounts", async () => {
    for (let i = 0; i < 30; i++) await attemptLogin({ email: `spray-${i}@nowhere.test`, password: "x" }, "10.9.9.9");
    expect(await attemptLogin({ email: EMAILS.riversideAdmin, password: DEMO_PASSWORD }, "10.9.9.9")).toEqual({ ok: false, reason: "rate_limited" });
    expect((await attemptLogin({ email: EMAILS.riversideAdmin, password: DEMO_PASSWORD }, "10.9.9.10")).ok).toBe(true);
  });

  it("stores only hashed keys for attempts", async () => {
    const rows = await adminConn()<{ email_key: string; ip_key: string }[]>`select email_key, ip_key from login_attempt`;
    expect(rows.length).toBeGreaterThan(0);
    const dump = JSON.stringify(rows);
    expect(dump).not.toContain("@");
    expect(dump).not.toContain("10.9.9.9");
  });

  it("stores passwords as Argon2id hashes", async () => {
    const [row] = await adminConn()<{ password_hash: string }[]>`select password_hash from app_user where id = ${IDS.northgateAdmin}`;
    expect(row!.password_hash).toMatch(/^\$argon2id\$/);
  });
});
