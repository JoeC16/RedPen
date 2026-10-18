// Build step 5: dashboards from aggregates with small groups suppressed,
// retention that deletes work and keeps the numbers, a teacher deleting work
// early, and deleting everything for a school with two different admins.
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createAssignment } from "@/server/dal/assignments";
import { approve, getReview, MarkingError, reopen, saveMarks, saveWork } from "@/server/dal/marking";
import { getDashboard } from "@/server/dal/oversight";
import { addPhoto } from "@/server/dal/photos";
import { listSchools } from "@/server/dal/schools";
import {
  cancelSchoolDeletion,
  confirmSchoolDeletion,
  deleteWork,
  listDeletionRequests,
  requestSchoolDeletion,
  runRetention,
  setRetention,
  setTimeSavedMinutes,
} from "@/server/dal/retention";
import { closeDb } from "@/server/db/client";
import { setStorageForTests } from "@/server/storage";
import { LocalStorage } from "@/server/storage/local";
import { ForbiddenError } from "@/server/tenancy";
import type { SessionUser } from "@/server/user-context";
import { SCIENCE_SCHEME } from "../../scripts/lib/fixtures";
import { IDS, adminConn, appConn, asApp, ctxOf, rawCtxOf } from "../helpers";
import { ctxForUserId } from "@/server/user-context";

const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xda, 0, 4, 1, 0]), Buffer.from("pixels"), Buffer.from([0xff, 0xd9])]);

let store: LocalStorage;
let t1: SessionUser;

// Hillcrest starts empty in the fixture. These tests give it a second admin, a
// teacher, a class of six pupils and six approved, AI-marked scripts.
const H = {
  admin2: crypto.randomUUID(),
  teacher: crypto.randomUUID(),
  cls: crypto.randomUUID(),
  assignment: crypto.randomUUID(),
  pupils: Array.from({ length: 6 }, () => crypto.randomUUID()),
};

async function seedHillcrest() {
  const a = adminConn();
  await a`insert into app_user (id, authority_id, school_id, email, display_name, role) values
    (${H.admin2}, ${IDS.authorityDemo}, ${IDS.schoolHillcrest}, 'hc-admin2@oversight.test', 'Second Admin', 'school_admin'),
    (${H.teacher}, ${IDS.authorityDemo}, ${IDS.schoolHillcrest}, 'hc-teacher@oversight.test', 'Hill Teacher', 'teacher')`;
  await a`insert into class (id, school_id, name, year_group, subject) values (${H.cls}, ${IDS.schoolHillcrest}, '9H', 9, 'Science')`;
  await a`insert into class_teacher values (${H.cls}, ${H.teacher}, ${IDS.schoolHillcrest})`;
  await a`insert into assignment (id, class_id, school_id, title, work_type, scheme_text, total_marks, criteria, created_by)
    values (${H.assignment}, ${H.cls}, ${IDS.schoolHillcrest}, 'Quiz', 'short', 'Q1 (2) Q2 (2)', 4,
            ${a.json([{ label: "Q1", max: 2 }, { label: "Q2", max: 2 }])}, ${H.teacher})`;
  // [ai Q1, ai Q2, final Q1, final Q2, flags]
  const marks: [number, number, number, number, number][] = [
    [2, 2, 2, 2, 0],
    [1, 2, 1, 2, 1],
    [1, 1, 1, 1, 0],
    [0, 1, 0, 1, 2],
    [1, 1, 2, 1, 0], // changed by one mark
    [0, 0, 2, 1, 0], // changed by three
  ];
  for (const [i, pid] of H.pupils.entries()) {
    const [ai1, ai2, f1, f2, flags] = marks[i]!;
    const sid = crypto.randomUUID();
    const rid = crypto.randomUUID();
    await a`insert into pupil (id, class_id, school_id, code) values (${pid}, ${H.cls}, ${IDS.schoolHillcrest}, ${`HC${i}`})`;
    await a`insert into submission (id, assignment_id, pupil_id, class_id, school_id, text, status, created_at)
      values (${sid}, ${H.assignment}, ${pid}, ${H.cls}, ${IDS.schoolHillcrest}, 'some work', 'review', now() - interval '2 days')`;
    await a`insert into mark_result (id, submission_id, class_id, school_id, assignment_id, scheme_version, run_number, source, model, prompt_version, confidence, flags, tokens_in, tokens_out, cache_read_tokens)
      values (${rid}, ${sid}, ${H.cls}, ${IDS.schoolHillcrest}, ${H.assignment}, 1, 1, 'ai', 'test-model', 'p1', 'high',
              ${a.json(Array.from({ length: flags }, () => "check"))}, 1000, 200, 0)`;
    await a`insert into mark_line (mark_result_id, class_id, school_id, position, label, max, ai_awarded, final_awarded, evidence)
      values (${rid}, ${H.cls}, ${IDS.schoolHillcrest}, 0, 'Q1', 2, ${ai1}, ${f1}, 'quote'),
             (${rid}, ${H.cls}, ${IDS.schoolHillcrest}, 1, 'Q2', 2, ${ai2}, ${f2}, 'quote')`;
    const changed = Number(ai1 !== f1) + Number(ai2 !== f2);
    await a`insert into approval (submission_id, class_id, school_id, mark_result_id, approved_by, approved_at, final_total, ai_total, lines_changed)
      values (${sid}, ${H.cls}, ${IDS.schoolHillcrest}, ${rid}, ${H.teacher}, now() - interval '38 hours', ${f1 + f2}, ${ai1 + ai2}, ${changed})`;
    await a`update submission set status = 'approved', delete_after = now() + interval '30 days' where id = ${sid}`;
  }
  // The teacher did something this week.
  await a`insert into audit_event (actor_id, authority_id, school_id, action) values (${H.teacher}, ${IDS.authorityDemo}, ${IDS.schoolHillcrest}, 'submission.approved')`;
}

beforeAll(async () => {
  store = new LocalStorage(mkdtempSync(path.join(tmpdir(), "redpen-oversight-")));
  setStorageForTests(store);
  t1 = await ctxOf("northgateTeacher1");
  await seedHillcrest();
});

afterAll(async () => {
  setStorageForTests(undefined);
  await appConn().end();
  await adminConn().end();
  await closeDb();
});

const hcAdmin2 = async () => (await ctxForUserId(H.admin2))!;

describe("dashboards", () => {
  it("are for admins only", async () => {
    await expect(getDashboard(t1)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("the authority dashboard shows each school's figures, computed from real rows", async () => {
    const d = (await getDashboard(await ctxOf("authorityAdmin")))!;
    expect(d.scope).toBe("authority");
    expect(d.schools.map((s) => s.id).sort()).toEqual([IDS.schoolNorthgate, IDS.schoolRiverside, IDS.schoolHillcrest].sort());
    const hc = d.schools.find((s) => s.id === IDS.schoolHillcrest)!;
    expect(hc.figures).toMatchObject({
      scripts: 6,
      pupilsMarked: 6,
      assignmentsMarked: 1,
      shareApproved: 1,
      medianHoursToApproval: expect.closeTo(10, 2),
      flaggedRate: 2 / 6,
      aiApproved: 6,
      keptUnchangedRate: 4 / 6,
      withinOneRate: 5 / 6,
      timeSavedMinutes: 18, // 6 short-answer scripts at 3 minutes each
    });
    expect(hc.staff).toBe(1); // teachers only; admins are not counted
    expect(d.schools.find((s) => s.id === IDS.schoolNorthgate)!.staff).toBe(2); // the disabled teacher is not counted
    expect((await listSchools(await ctxOf("authorityAdmin"))).find((s) => s.id === IDS.schoolHillcrest)?.staffCount).toBe(3);
    expect(hc.byType.short.scripts).toBe(6);
    expect(hc.byType.essay.scripts).toBe(0);
    expect(hc.weekly.at(-1)).toMatchObject({ activeTeachers: 1 });
    expect(hc.weekly.at(-1)!.approvals).toBe(6);
    expect(d.weeks).toBe(6);
    expect(hc.weekly).toHaveLength(6);
  });

  it("suppresses figures from fewer than 5 pupils or scripts", async () => {
    // Riverside has no AI-marked work and at most a handful of scripts.
    const d = (await getDashboard(await ctxOf("riversideAdmin")))!;
    expect(d.scope).toBe("school");
    expect(d.schools.map((s) => s.id)).toEqual([IDS.schoolRiverside]);
    for (const v of Object.values(d.total.figures)) expect(v === null || v === "small" || v === 0).toBe(true);
  });

  it("uses the authority's own minutes per script for time saved", async () => {
    const admin = await ctxOf("authorityAdmin");
    await setTimeSavedMinutes(admin, { short: 5, maths: 4, essay: 8 });
    const d = (await getDashboard(admin, { schoolId: IDS.schoolHillcrest }))!;
    expect(d.total.figures.timeSavedMinutes).toBe(30);
    await expect(setTimeSavedMinutes(await ctxOf("northgateAdmin"), { short: 1, maths: 1, essay: 1 })).rejects.toBeInstanceOf(ForbiddenError);
    const [ev] = await adminConn()`select metadata from audit_event where action = 'settings.time_saved_changed' order by id desc limit 1`;
    expect(ev?.metadata).toMatchObject({ to: { short: 5 } });
    await setTimeSavedMinutes(admin, { short: 3, maths: 4, essay: 8 });
  });

  it("a school admin sees only their own school, whatever they ask for", async () => {
    const d = (await getDashboard(await ctxOf("riversideAdmin"), { schoolId: IDS.schoolHillcrest }))!;
    expect(d.schools.map((s) => s.id)).toEqual([IDS.schoolRiverside]);
    expect(await getDashboard(await ctxOf("otherAdmin"), { schoolId: IDS.schoolHillcrest })).toMatchObject({ schools: [{ id: IDS.schoolOther }] });
    expect(await getDashboard(await ctxOf("otherAuthorityAdmin"), { schoolId: IDS.schoolHillcrest })).toBeNull();
  });

  it("the aggregate functions refuse teachers and return no rows across authorities", async () => {
    const since = new Date(Date.now() - 86_400_000 * 60).toISOString();
    await expect(
      asApp(await rawCtxOf("northgateTeacher1"), (sql) => sql`select * from app_oversight_summary(null, ${since})`),
    ).rejects.toThrow(/dashboards are for school and authority admins/);
    const rows = await asApp(await rawCtxOf("otherAuthorityAdmin"), (sql) => sql`select * from app_oversight_summary(${IDS.schoolHillcrest}, ${since})`);
    expect(rows.every((r) => r.scripts === 0 || r.scripts === null)).toBe(true);
    expect(rows.filter((r) => r.school_id !== null)).toHaveLength(0);
  });
});

describe("retention", () => {
  let aid: string;
  let pupils: { id: string; code: string }[];

  beforeAll(async () => {
    aid = (await createAssignment(t1, IDS.classNorthgateSci, { ...SCIENCE_SCHEME, title: "Retention test" }))!;
    pupils = await adminConn()<{ id: string; code: string }[]>`select id, code from pupil where class_id = ${IDS.classNorthgateSci} order by code`;
  });

  const lines = (n: number) => [0, 1, 2, 3, 4].map((position) => ({ position, finalAwarded: Math.min(n, 1), comment: "Good recall of the term" }));

  async function approved(i: number) {
    const p = pupils[i]!;
    await saveWork(t1, aid, p.id, "Chloroplast. Carbon dioxide and water make glucose.");
    await addPhoto(t1, aid, { pupilId: p.id, fileName: "page.jpg", bytes: JPEG, namesConfirmed: true });
    await saveMarks(t1, aid, p.id, { lines: lines(1), feedback: "Well done on Q1." });
    await approve(t1, aid, p.id);
    const [s] = await adminConn()`select id from submission where assignment_id = ${aid} and pupil_id = ${p.id}`;
    return String(s!.id);
  }

  it("deletes the work, photos and feedback of approved work past its date, and keeps the marks", async () => {
    const due = await approved(0);
    const notDue = await approved(1);
    await saveWork(t1, aid, pupils[2]!.id, "Unapproved work stays.");
    const [file] = await adminConn()`select storage_key from submission_file where submission_id = ${due}`;
    await adminConn()`update submission set delete_after = now() - interval '1 minute' where id = ${due}`;

    const r = await runRetention();
    expect(r.submissions).toBeGreaterThanOrEqual(1);

    const [s] = await adminConn()`select text, feedback, status, content_deleted_at from submission where id = ${due}`;
    expect(s).toMatchObject({ text: null, feedback: null, status: "approved" });
    expect(s!.content_deleted_at).toBeInstanceOf(Date);
    const ml = await adminConn()`select l.final_awarded, l.evidence, l.comment, l.ai_comment from mark_line l join mark_result m on m.id = l.mark_result_id where m.submission_id = ${due}`;
    expect(ml.map((l) => Number(l.final_awarded))).toEqual([1, 1, 1, 1, 1]);
    expect(ml.every((l) => l.evidence === null && l.comment === null && l.ai_comment === null)).toBe(true);
    const [ap] = await adminConn()`select final_total, final_feedback from approval where submission_id = ${due}`;
    expect(ap).toMatchObject({ final_total: "5.0", final_feedback: null });
    expect(await adminConn()`select 1 from submission_file where submission_id = ${due}`).toHaveLength(0);
    await expect(store.get(String(file!.storage_key))).rejects.toThrow();
    expect(await adminConn()`select 1 from pending_object_deletion where storage_key = ${String(file!.storage_key)}`).toHaveLength(0);

    // Not yet due, and not approved: untouched.
    const [kept] = await adminConn()`select text from submission where id = ${notDue}`;
    expect(kept!.text).toMatch(/Chloroplast/);
    const [draft] = await adminConn()`select text from submission where assignment_id = ${aid} and pupil_id = ${pupils[2]!.id}`;
    expect(draft!.text).toBe("Unapproved work stays.");

    const [ev] = await adminConn()`select actor_id, metadata from audit_event where action = 'retention.deleted' and school_id = ${IDS.schoolNorthgate} order by id desc limit 1`;
    expect(ev).toMatchObject({ actor_id: null });
    expect(Number((ev!.metadata as { submissions: number }).submissions)).toBeGreaterThanOrEqual(1);
  });

  it("deleted work stays deleted: no reopening, no restoring, and the review screen says so", async () => {
    const p = pupils[0]!;
    await expect(reopen(t1, aid, p.id, "Typo")).rejects.toThrow(/can no longer be reopened/);
    await expect(adminConn()`update submission set text = 'back again' where assignment_id = ${aid} and pupil_id = ${p.id}`).rejects.toThrow();
    await expect(adminConn()`update submission set content_deleted_at = null where assignment_id = ${aid} and pupil_id = ${p.id}`).rejects.toThrow(/cannot be undone/);
    const v = await getReview(t1, aid, p.id);
    expect(v?.submission?.contentDeletedAt).toBeInstanceOf(Date);
    expect(v?.approval?.finalTotal).toBe(5);
    // The marks are still locked.
    await expect(adminConn()`update mark_line set final_awarded = 0 where mark_result_id in (select id from mark_result where submission_id = ${v!.submission!.id})`).rejects.toThrow(/locked/);
  });

  it("a teacher can delete work early: approved work keeps its marks, draft work goes entirely", async () => {
    const approvedId = await approved(3);
    await expect(deleteWork(await ctxOf("northgateTeacher2"), aid, pupils[3]!.id)).resolves.toBe(false);
    await expect(deleteWork(await ctxOf("northgateAdmin"), aid, pupils[3]!.id)).rejects.toBeInstanceOf(ForbiddenError);
    expect(await deleteWork(t1, aid, pupils[3]!.id)).toBe("content");
    const [s] = await adminConn()`select text, content_deleted_at from submission where id = ${approvedId}`;
    expect(s!.text).toBeNull();
    await expect(deleteWork(t1, aid, pupils[3]!.id)).rejects.toBeInstanceOf(MarkingError);

    await addPhoto(t1, aid, { pupilId: pupils[2]!.id, fileName: "p.jpg", bytes: JPEG, namesConfirmed: true });
    const [f] = await adminConn()`select f.storage_key from submission_file f join submission s on s.id = f.submission_id where s.assignment_id = ${aid} and s.pupil_id = ${pupils[2]!.id}`;
    expect(await deleteWork(t1, aid, pupils[2]!.id)).toBe("all");
    expect(await adminConn()`select 1 from submission where assignment_id = ${aid} and pupil_id = ${pupils[2]!.id}`).toHaveLength(0);
    await expect(store.get(String(f!.storage_key))).rejects.toThrow();
    const events = await adminConn()`select action from audit_event where action in ('submission.content_deleted', 'submission.deleted') and actor_id = ${IDS.northgateTeacher1}`;
    expect(events.map((e) => e.action).sort()).toEqual(["submission.content_deleted", "submission.deleted"]);
  });

  it("changing the retention period reschedules approved work still held; authority admins only", async () => {
    const id = await approved(4);
    await expect(setRetention(await ctxOf("northgateAdmin"), 7)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(setRetention(await ctxOf("authorityAdmin"), 0)).rejects.toThrow(/At least 1 day/);
    expect(await setRetention(await ctxOf("authorityAdmin"), 7)).toBeGreaterThanOrEqual(1);
    const [row] = await adminConn()`select s.delete_after, a.approved_at from submission s join approval a on a.submission_id = s.id and a.reopened_at is null where s.id = ${id}`;
    expect((row!.delete_after as Date).getTime() - (row!.approved_at as Date).getTime()).toBe(7 * 86_400_000);
    const [ev] = await adminConn()`select metadata from audit_event where action = 'settings.retention_changed' order by id desc limit 1`;
    expect(ev?.metadata).toMatchObject({ from: 30, to: 7 });
    await setRetention(await ctxOf("authorityAdmin"), 30);
  });

  it("the deletion queue is not readable by the app role", async () => {
    for (const key of ["northgateTeacher1", "northgateAdmin", "authorityAdmin"] as const) {
      await expect(asApp(await rawCtxOf(key), (sql) => sql`select * from pending_object_deletion`)).rejects.toThrow(/permission denied/);
    }
  });
});

describe("deleting everything for a school", () => {
  it("needs a request and a different admin's confirmation", async () => {
    const hc1 = await ctxOf("hillcrestAdmin");
    await expect(requestSchoolDeletion(await ctxOf("riversideAdmin"), IDS.schoolHillcrest)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(requestSchoolDeletion(await ctxOf("otherAuthorityAdmin"), IDS.schoolHillcrest)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(requestSchoolDeletion((await ctxForUserId(H.teacher))!, IDS.schoolHillcrest)).rejects.toBeInstanceOf(ForbiddenError);

    const req = await requestSchoolDeletion(hc1, IDS.schoolHillcrest);
    await expect(requestSchoolDeletion(await ctxOf("authorityAdmin"), IDS.schoolHillcrest)).rejects.toThrow(/already waiting/);
    await expect(confirmSchoolDeletion(hc1, req)).rejects.toThrow(/different admin must confirm/);
    await expect(confirmSchoolDeletion(await ctxOf("riversideAdmin"), req)).rejects.toBeInstanceOf(ForbiddenError);
    expect((await listDeletionRequests(hc1, IDS.schoolHillcrest))[0]).toMatchObject({ id: req, status: "open" });
    expect(await listDeletionRequests(await ctxOf("riversideAdmin"), IDS.schoolHillcrest)).toEqual([]);
    expect(await cancelSchoolDeletion(await hcAdmin2(), req)).toBe(true);
    await expect(confirmSchoolDeletion(await hcAdmin2(), req)).rejects.toThrow(/no longer open/);
  });

  it("an expired request cannot be confirmed", async () => {
    const req = await requestSchoolDeletion(await ctxOf("hillcrestAdmin"), IDS.schoolHillcrest);
    await adminConn()`update school_deletion_request set expires_at = now() - interval '1 second' where id = ${req}`;
    await expect(confirmSchoolDeletion(await hcAdmin2(), req)).rejects.toThrow(/expired/);
    expect((await listDeletionRequests(await ctxOf("hillcrestAdmin"), IDS.schoolHillcrest))[0]).toMatchObject({ status: "expired" });
  });

  it("deletes every class, pupil and piece of work in that school only, and keeps staff and the audit log", async () => {
    const before = await adminConn()`select school_id, count(*)::int as n from pupil group by school_id`;
    const auditBefore = await adminConn()`select count(*)::int as n from audit_event where school_id = ${IDS.schoolHillcrest}`;
    const req = await requestSchoolDeletion(await hcAdmin2(), IDS.schoolHillcrest);
    const counts = await confirmSchoolDeletion(await ctxOf("authorityAdmin"), req);
    expect(counts).toMatchObject({ classes: 1, pupils: 6, assignments: 1, submissions: 6, photos: 0 });

    for (const t of ["class", "pupil", "assignment", "submission", "mark_result", "mark_line", "approval", "submission_file"]) {
      expect(await adminConn().unsafe(`select 1 from ${t} where school_id = $1`, [IDS.schoolHillcrest])).toHaveLength(0);
    }
    const after = await adminConn()`select school_id, count(*)::int as n from pupil group by school_id`;
    expect(after).toEqual(before.filter((r) => r.school_id !== IDS.schoolHillcrest));
    expect(await adminConn()`select 1 from app_user where id in (${H.admin2}, ${H.teacher})`).toHaveLength(2);
    const [{ n }] = (await adminConn()`select count(*)::int as n from audit_event where school_id = ${IDS.schoolHillcrest}`) as unknown as [{ n: number }];
    expect(n).toBeGreaterThan(auditBefore[0]!.n);
    const [ev] = await adminConn()`select actor_id, metadata from audit_event where action = 'school.data_deleted' and school_id = ${IDS.schoolHillcrest}`;
    expect(ev).toMatchObject({ actor_id: IDS.authorityAdmin, metadata: { pupils: 6, requestedBy: H.admin2 } });
    expect((await listDeletionRequests(await ctxOf("authorityAdmin"), IDS.schoolHillcrest))[0]).toMatchObject({ status: "confirmed" });
  });

  it("refuses non-admins and unknown requests cleanly", async () => {
    await expect(confirmSchoolDeletion(t1, crypto.randomUUID())).rejects.toBeInstanceOf(ForbiddenError);
    await expect(confirmSchoolDeletion(await ctxOf("authorityAdmin"), crypto.randomUUID())).rejects.toBeInstanceOf(ForbiddenError);
    await expect(cancelSchoolDeletion(await ctxOf("authorityAdmin"), "not-a-uuid")).rejects.toBeInstanceOf(ForbiddenError);
  });
});
