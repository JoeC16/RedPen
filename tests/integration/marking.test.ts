// Teacher core: assignments, work, manual marking, approval, reopening, moving,
// export, and who can do each of them. Leaves the shared fixture as it found it.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createAssignment, getAssignment, listAssignments, updateAssignment } from "@/server/dal/assignments";
import { createClass, getClass, importPupils, listClasses, setClassTeacher } from "@/server/dal/classes";
import { approve, exportAssignment, getReview, MarkingError, moveWork, reopen, reviewQueue, saveMarks, saveWork, setAbsent } from "@/server/dal/marking";
import { closeDb } from "@/server/db/client";
import type { SchemeInput } from "@/server/marking/marks";
import { ForbiddenError } from "@/server/tenancy";
import { IDS, adminConn, appConn, asApp, ctxOf, rawCtxOf } from "../helpers";
import type { SessionUser } from "@/server/user-context";

let t1: SessionUser; // teaches Northgate 9S1 and 10M2
let t2: SessionUser; // Northgate colleague, teaches 8E3 only
let rv: SessionUser; // Riverside teacher
let ngAdmin: SessionUser;
let authAdmin: SessionUser;
const created: { classes: string[]; assignments: string[] } = { classes: [], assignments: [] };

const scheme = (over: Partial<SchemeInput> = {}): SchemeInput => ({
  title: "Algebra and area",
  workType: "maths",
  schemeText: "Q1 Expand 3(x+2). M1 A1\nQ2 Area of a 3 by 4 rectangle. A1",
  totalMarks: 3,
  criteria: [
    { label: "Q1", max: 2 },
    { label: "Q2", max: 1 },
  ],
  ...over,
});

let pupils: { id: string; code: string }[] = [];

beforeAll(async () => {
  [t1, t2, rv, ngAdmin, authAdmin] = await Promise.all([
    ctxOf("northgateTeacher1"),
    ctxOf("northgateTeacher2"),
    ctxOf("riversideTeacher"),
    ctxOf("northgateAdmin"),
    ctxOf("authorityAdmin"),
  ]);
  pupils = await adminConn()<{ id: string; code: string }[]>`select id, code from pupil where class_id = ${IDS.classNorthgateMaths} order by code`;
});

afterAll(async () => {
  const sql = adminConn();
  await sql`delete from assignment where id = any(${created.assignments})`;
  await sql`delete from class where id = any(${created.classes})`;
  await sql`delete from class_teacher where class_id = ${IDS.classNorthgateSci} and user_id = ${IDS.northgateTeacher2}`;
  await appConn().end();
  await adminConn().end();
  await closeDb();
});

async function newAssignment(over: Partial<SchemeInput> = {}) {
  const id = await createAssignment(t1, IDS.classNorthgateMaths, scheme(over));
  expect(id).toBeTruthy();
  created.assignments.push(id!);
  return id!;
}

describe("assignments", () => {
  it("a teacher creates an assignment in their own class, audit logged", async () => {
    const id = await newAssignment();
    const a = await getAssignment(t1, id);
    expect(a).toMatchObject({ title: "Algebra and area", totalMarks: 3, schemeVersion: 1, criteria: scheme().criteria });
    const [ev] = await adminConn()`select action, actor_id from audit_event where target_id = ${id}`;
    expect(ev).toMatchObject({ action: "assignment.created", actor_id: IDS.northgateTeacher1 });
  });

  it("cannot create one in a colleague's class or another school's class", async () => {
    expect(await createAssignment(t1, IDS.classNorthgateEng, scheme())).toBeNull();
    expect(await createAssignment(t1, IDS.classRiversideSci, scheme())).toBeNull();
    expect(await createAssignment(t1, "not-a-uuid", scheme())).toBeNull();
  });

  it("is invisible to colleagues, other schools, and admins", async () => {
    const id = IDS.assignmentNorthgateSci;
    expect(await getAssignment(t2, id)).toBeNull();
    expect(await getAssignment(rv, id)).toBeNull();
    expect(await listAssignments(t2, IDS.classNorthgateSci)).toBeNull();
    await expect(getAssignment(ngAdmin, id)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(getAssignment(authAdmin, id)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("a scheme change bumps the version and is audited; a title change does not", async () => {
    const id = await newAssignment();
    expect(await updateAssignment(t1, id, scheme({ title: "Renamed" }))).toEqual({ schemeChanged: false });
    expect((await getAssignment(t1, id))?.schemeVersion).toBe(1);
    expect(await updateAssignment(t1, id, scheme({ totalMarks: 4, criteria: [{ label: "Q1", max: 3 }, { label: "Q2", max: 1 }] }))).toEqual({ schemeChanged: true });
    expect((await getAssignment(t1, id))?.schemeVersion).toBe(2);
    expect(await updateAssignment(t2, id, scheme())).toBeNull();
  });
});

describe("marking a pupil by hand", () => {
  let aid: string;
  beforeAll(async () => {
    aid = await newAssignment();
  });

  it("adds work, saves draft marks rounded and clamped, then approves with a retention date", async () => {
    const p = pupils[0]!;
    expect(await saveWork(t1, aid, p.id, "3x + 6\n12")).toBe(true);
    expect(await saveMarks(t1, aid, p.id, { lines: [{ position: 0, finalAwarded: 7, comment: "M1 A1" }, { position: 1, finalAwarded: 0.7, comment: "" }], feedback: "Good expansion. Check units next time." })).toBe(true);
    const draft = await getReview(t1, aid, p.id);
    expect(draft?.submission?.status).toBe("review");
    expect(draft?.lines.map((l) => l.finalAwarded)).toEqual([2, 0.5]);
    expect(draft?.run?.source).toBe("manual");

    expect(await approve(t1, aid, p.id)).toBe(true);
    const done = await getReview(t1, aid, p.id);
    expect(done?.submission?.status).toBe("approved");
    expect(done?.approval?.finalTotal).toBe(2.5);
    const [row] = await adminConn()<{ delete_after: Date; ai_total: string | null; lines_changed: number | null; final_feedback: string }[]>`
      select s.delete_after, a.ai_total, a.lines_changed, a.final_feedback from submission s join approval a on a.submission_id = s.id where s.id = ${done!.submission!.id}`;
    const days = (row!.delete_after.getTime() - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(29.9);
    expect(days).toBeLessThan(30.1);
    expect(row).toMatchObject({ ai_total: null, lines_changed: null, final_feedback: "Good expansion. Check units next time." });
  });

  it("locks approved marks in the app and in the database", async () => {
    const p = pupils[0]!;
    await expect(saveMarks(t1, aid, p.id, { lines: [{ position: 0, finalAwarded: 0, comment: null }], feedback: "" })).rejects.toBeInstanceOf(MarkingError);
    await expect(saveWork(t1, aid, p.id, "changed")).rejects.toBeInstanceOf(MarkingError);
    await expect(approve(t1, aid, p.id)).rejects.toBeInstanceOf(MarkingError);
    const runId = (await getReview(t1, aid, p.id))!.run!.id;
    await expect(adminConn()`update mark_line set final_awarded = 0 where mark_result_id = ${runId}`).rejects.toThrow(/locked by approval/);
    await expect(adminConn()`update submission set text = 'x' where assignment_id = ${aid} and pupil_id = ${p.id}`).rejects.toThrow(/approved/);
  });

  it("reopens with a reason, keeps the old approval, and can approve again", async () => {
    const p = pupils[0]!;
    await expect(reopen(t1, aid, p.id, "")).rejects.toBeInstanceOf(MarkingError);
    expect(await reopen(t1, aid, p.id, "Missed a method mark")).toBe(true);
    let v = await getReview(t1, aid, p.id);
    expect(v?.submission?.status).toBe("review");
    expect(v?.approval).toBeNull();
    await saveMarks(t1, aid, p.id, { lines: [{ position: 0, finalAwarded: 2, comment: null }, { position: 1, finalAwarded: 1, comment: null }], feedback: "Well done." });
    await approve(t1, aid, p.id);
    v = await getReview(t1, aid, p.id);
    expect(v?.approval?.finalTotal).toBe(3);
    expect(v?.history).toHaveLength(2);
    expect(v?.history.find((h) => h.reopenedAt)?.reopenReason).toBe("Missed a method mark");
    const [ev] = await adminConn()`select metadata from audit_event where action = 'submission.reopened' and target_id = ${v!.submission!.id}`;
    expect(ev?.metadata).toMatchObject({ reason: "Missed a method mark" });
  });

  it("will not approve until every line has a mark", async () => {
    const p = pupils[1]!;
    await saveMarks(t1, aid, p.id, { lines: [{ position: 0, finalAwarded: 1, comment: null }, { position: 1, finalAwarded: null, comment: null }], feedback: "" });
    await expect(approve(t1, aid, p.id)).rejects.toThrow(/Every mark line needs a mark/);
  });

  it("handles an absent pupil: no marks, no approval, shown as absent in the export", async () => {
    const p = pupils[2]!;
    expect(await setAbsent(t1, aid, p.id, true)).toBe(true);
    await expect(saveMarks(t1, aid, p.id, { lines: [], feedback: "" })).rejects.toThrow(/absent/);
    await expect(approve(t1, aid, p.id)).rejects.toThrow(/absent/);
    const exp = await exportAssignment(t1, aid);
    expect(exp?.rows.find((r) => r.code === p.code)?.state).toBe("absent");
  });

  it("orders the queue: drafts first, then not marked, absent, approved", async () => {
    const q = await reviewQueue(t1, aid);
    const ranks = q!.rows.map((r) => (r.status === "approved" ? 3 : r.absent ? 2 : r.status === "review" ? 0 : 1));
    expect(ranks).toEqual([...ranks].sort());
    expect(q!.rows.at(-1)?.status).toBe("approved");
  });

  it("exports only approved marks and feedback", async () => {
    const exp = await exportAssignment(t1, aid);
    const approved = exp!.rows.filter((r) => r.state === "approved");
    expect(approved).toHaveLength(1);
    expect(approved[0]).toMatchObject({ code: pupils[0]!.code, lines: [2, 1], total: 3, feedback: "Well done." });
    const draft = exp!.rows.find((r) => r.code === pupils[1]!.code)!;
    expect(draft).toMatchObject({ state: "not approved", total: null, lines: [null, null], feedback: null });
    expect(await exportAssignment(t2, aid)).toBeNull();
  });

  it("never writes pupil work into the audit log", async () => {
    const rows = await adminConn()`select metadata::text as m from audit_event where action = 'submission.work_saved'`;
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) expect(r.m).not.toContain("3x + 6");
  });
});

describe("scheme change and moving work keep history", () => {
  it("a scheme change sends drafts back to be marked; earlier runs stay", async () => {
    const aid = await newAssignment();
    const p = pupils[3]!;
    await saveMarks(t1, aid, p.id, { lines: [{ position: 0, finalAwarded: 1, comment: null }, { position: 1, finalAwarded: 1, comment: null }], feedback: "" });
    await updateAssignment(t1, aid, scheme({ totalMarks: 4, criteria: [{ label: "Q1", max: 2 }, { label: "Q2", max: 1 }, { label: "Q3", max: 1 }] }));
    const v = await getReview(t1, aid, p.id);
    expect(v?.submission?.status).toBe("todo");
    expect(v?.run).toBeNull();
    expect(v?.lines.map((l) => l.label)).toEqual(["Q1", "Q2", "Q3"]);
    await saveMarks(t1, aid, p.id, { lines: [{ position: 2, finalAwarded: 1, comment: null }], feedback: "" });
    const [{ runs }] = (await adminConn()`select count(*)::int as runs from mark_result where submission_id = ${v!.submission!.id}`) as unknown as [{ runs: number }];
    expect(runs).toBe(2);
  });

  it("moves work handed in for the wrong assignment, within the class only", async () => {
    const from = await newAssignment({ title: "Homework 1" });
    const to = await newAssignment({ title: "Homework 2" });
    const p = pupils[4]!;
    await saveWork(t1, from, p.id, "my answers");
    expect(await moveWork(t1, from, p.id, IDS.assignmentNorthgateSci)).toBe(false); // other class
    expect(await moveWork(t1, from, p.id, IDS.assignmentRiversideSci)).toBe(false); // other school
    expect(await moveWork(t1, from, p.id, to)).toBe(true);
    expect((await getReview(t1, to, p.id))?.submission?.text).toBe("my answers");
    expect((await getReview(t1, from, p.id))?.submission).toBeNull();
    await saveWork(t1, from, p.id, "second copy");
    await expect(moveWork(t1, from, p.id, to)).rejects.toThrow(/already has work/);
  });
});

describe("DAL tenancy: cross-school and cross-teacher", () => {
  it("nobody outside the class can read or change its marking", async () => {
    const aid = IDS.assignmentNorthgateSci;
    const [pupil] = await adminConn()<{ id: string }[]>`select id from pupil where class_id = ${IDS.classNorthgateSci} limit 1`;
    for (const who of [t2, rv]) {
      expect(await reviewQueue(who, aid)).toBeNull();
      expect(await getReview(who, aid, pupil!.id)).toBeNull();
      expect(await saveWork(who, aid, pupil!.id, "x")).toBe(false);
      expect(await saveMarks(who, aid, pupil!.id, { lines: [], feedback: "" })).toBe(false);
      expect(await approve(who, aid, pupil!.id)).toBe(false);
      expect(await setAbsent(who, aid, pupil!.id, true)).toBe(false);
      expect(await exportAssignment(who, aid)).toBeNull();
    }
    for (const admin of [ngAdmin, authAdmin]) {
      await expect(reviewQueue(admin, aid)).rejects.toBeInstanceOf(ForbiddenError);
      await expect(saveWork(admin, aid, pupil!.id, "x")).rejects.toBeInstanceOf(ForbiddenError);
    }
    const [{ n }] = (await adminConn()`select count(*)::int as n from submission where assignment_id = ${aid}`) as unknown as [{ n: number }];
    expect(n).toBe(0);
  });

  it("a teacher cannot mark a pupil from another class against their own assignment", async () => {
    const aid = await newAssignment();
    const [other] = await adminConn()<{ id: string }[]>`select id from pupil where class_id = ${IDS.classNorthgateEng} limit 1`;
    expect(await saveWork(t1, aid, other!.id, "x")).toBe(false);
  });

});

describe("database layer (row-level security)", () => {
  it("hides pupil work and marks from school admins and colleagues", async () => {
    for (const key of ["northgateAdmin", "northgateTeacher2", "authorityAdmin"] as const) {
      const ctx = await rawCtxOf(key);
      await asApp(ctx, async (sql) => {
        for (const table of ["assignment", "submission", "mark_result", "mark_line", "approval"]) {
          const rows = await sql.unsafe(`select * from ${table} where school_id = '${IDS.schoolNorthgate}' and class_id <> '${IDS.classNorthgateEng}'`);
          expect(rows, `${key} ${table}`).toHaveLength(0);
        }
      });
    }
  });

  it("refuses a submission pointing at another school's assignment", async () => {
    const ctx = await rawCtxOf("northgateTeacher1");
    await expect(
      asApp(ctx, (sql) => sql`insert into submission (assignment_id, pupil_id, class_id, school_id)
        values (${IDS.assignmentRiversideSci}, ${pupils[0]!.id}, ${IDS.classNorthgateMaths}, ${IDS.schoolNorthgate})`),
    ).rejects.toThrow();
  });
});

describe("classes and pupils", () => {
  it("a teacher creates a class and is its teacher; colleagues cannot see it", async () => {
    const id = await createClass(t1, { name: "Test 11T", yearGroup: 11, subject: "Physics" });
    created.classes.push(id);
    expect((await listClasses(t1)).map((c) => c.id)).toContain(id);
    expect(await getClass(t2, id)).toBeNull();
    expect(await getClass(ngAdmin, id)).not.toBeNull();
  });

  it("the class-creation function refuses authority admins", async () => {
    await expect(createClass(authAdmin, { name: "X", yearGroup: 9, subject: "X" })).rejects.toBeInstanceOf(ForbiddenError);
    const ctx = await rawCtxOf("authorityAdmin");
    await expect(asApp(ctx, (sql) => sql`select app_create_class('X', 9::smallint, 'X')`)).rejects.toThrow(/not allowed/);
  });

  it("imports pupils with encrypted names, refusing codes already used anywhere in the school", async () => {
    const classId = created.classes[0]!;
    const clash = await importPupils(t1, classId, [{ code: "NG8E01", name: null }]); // in a colleague's class
    expect(clash?.added).toBe(0);
    expect(clash?.errors[0]?.message).toMatch(/NG8E01 is already used/);
    const ok = await importPupils(t1, classId, [{ code: "T11T01", name: "Ada Testpupil" }, { code: "T11T02", name: null }]);
    expect(ok).toEqual({ added: 2, errors: [] });
    const [row] = await adminConn()<{ display_name_enc: string }[]>`select display_name_enc from pupil where code = 'T11T01'`;
    expect(row!.display_name_enc).toMatch(/^v1\./);
    expect(row!.display_name_enc).not.toContain("Ada");
    expect(await importPupils(t2, classId, [{ code: "T11T03", name: null }])).toBeNull();
    expect(await importPupils(rv, classId, [{ code: "T11T04", name: null }])).toBeNull();
  });

  it("a school admin shares a class with a colleague, and only within their school", async () => {
    expect(await getClass(t2, IDS.classNorthgateSci)).toBeNull();
    expect(await setClassTeacher(ngAdmin, IDS.classNorthgateSci, IDS.northgateTeacher2, true)).toBe(true);
    expect(await getClass(t2, IDS.classNorthgateSci)).not.toBeNull();
    expect(await setClassTeacher(ngAdmin, IDS.classNorthgateSci, IDS.northgateTeacher2, false)).toBe(true);
    expect(await getClass(t2, IDS.classNorthgateSci)).toBeNull();
    expect(await setClassTeacher(ngAdmin, IDS.classNorthgateSci, IDS.riversideTeacher, true)).toBe(false);
    expect(await setClassTeacher(ngAdmin, IDS.classRiversideSci, IDS.northgateTeacher2, true)).toBe(false);
    await expect(setClassTeacher(t1, IDS.classNorthgateSci, IDS.northgateTeacher2, true)).rejects.toBeInstanceOf(ForbiddenError);
  });
});
