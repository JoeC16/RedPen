// The demo dataset for the Demo Education Authority, on top of the foundation
// fixture: about a dozen teachers, about 20 classes across maths, science and
// English, around a thousand pieces of work over six weeks, in every state.
// Everything is invented. Rows are real, so every dashboard figure is computed
// from the database, never typed in. Deterministic apart from ids and dates.
import postgres from "postgres";
import { encryptText } from "../../src/server/crypto";
import { pupilText, resultFor, teacherMarks, type Choice } from "../../src/server/demo/marker";
import { templateByKey, type Template } from "../../src/server/demo/templates";
import { PROMPT_VERSION } from "../../src/server/marking/prompt";
import { hashPassword } from "../../src/server/password";
import { DEMO_PASSWORD, IDS } from "./fixtures";

/** Small deterministic random generator (mulberry32), so the demo looks the same every time. */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

type School = { id: string; prefix: string; domain: string; adoption: number; startWeek: number };
const SCHOOLS: Record<"ng" | "rv" | "hc", School> = {
  // Adoption: the share of work teachers send to the AI. startWeek: how many weeks ago the school started.
  ng: { id: IDS.schoolNorthgate, prefix: "NG", domain: "northgate.test", adoption: 0.85, startWeek: 5 },
  rv: { id: IDS.schoolRiverside, prefix: "RV", domain: "riverside.test", adoption: 0.95, startWeek: 5 },
  hc: { id: IDS.schoolHillcrest, prefix: "HC", domain: "hillcrest.test", adoption: 0.45, startWeek: 3 },
};

const TEACHERS: { key: string; name: string; school: keyof typeof SCHOOLS; id?: string }[] = [
  { key: "byrne", name: "Aoife Byrne", school: "ng", id: IDS.northgateTeacher1 },
  { key: "doyle", name: "Ciaran Doyle", school: "ng", id: IDS.northgateTeacher2 },
  { key: "rafferty", name: "Declan Rafferty", school: "ng" },
  { key: "mcaleer", name: "Orla McAleer", school: "ng" },
  { key: "nair", name: "Priya Nair", school: "ng" },
  { key: "kerr", name: "Grace Kerr", school: "rv", id: IDS.riversideTeacher },
  { key: "gallagher", name: "Eoin Gallagher", school: "rv" },
  { key: "wilson", name: "Hannah Wilson", school: "rv" },
  { key: "bell", name: "Marcus Bell", school: "rv" },
  { key: "kearney", name: "Siobhan Kearney", school: "hc" },
  { key: "reid", name: "Tom Reid", school: "hc" },
  { key: "murphy", name: "Aisling Murphy", school: "hc" },
];

type ClassPlan = {
  school: keyof typeof SCHOOLS;
  name: string;
  year: number;
  subject: "Mathematics" | "Science" | "English";
  teacher: string;
  size: number;
  /** [template key, weeks ago it was set]. */
  work: [string, number][];
  /** The class kept unmarked for marking live in a demo. */
  live?: string;
};

const CLASSES: ClassPlan[] = [
  // Northgate
  { school: "ng", name: "10M1", year: 10, subject: "Mathematics", teacher: "byrne", size: 30, work: [["fractions", 2]], live: "algebra" },
  { school: "ng", name: "9M3", year: 9, subject: "Mathematics", teacher: "rafferty", size: 27, work: [["fractions", 4], ["algebra", 1]] },
  { school: "ng", name: "11M1", year: 11, subject: "Mathematics", teacher: "rafferty", size: 25, work: [["algebra", 5], ["fractions", 0]] },
  { school: "ng", name: "9E1", year: 9, subject: "English", teacher: "mcaleer", size: 28, work: [["techniques", 5], ["market", 2]] },
  { school: "ng", name: "10E2", year: 10, subject: "English", teacher: "mcaleer", size: 26, work: [["persuasive", 3], ["techniques", 0]] },
  { school: "ng", name: "8S2", year: 8, subject: "Science", teacher: "nair", size: 29, work: [["particles", 4], ["cells", 1]] },
  { school: "ng", name: "10S1", year: 10, subject: "Science", teacher: "nair", size: 24, work: [["cells", 5], ["particles", 2]] },
  // Riverside
  { school: "rv", name: "8M1", year: 8, subject: "Mathematics", teacher: "gallagher", size: 28, work: [["fractions", 5], ["algebra", 2]] },
  { school: "rv", name: "10M3", year: 10, subject: "Mathematics", teacher: "gallagher", size: 26, work: [["algebra", 3], ["fractions", 0]] },
  { school: "rv", name: "9E2", year: 9, subject: "English", teacher: "wilson", size: 27, work: [["market", 4], ["techniques", 1]] },
  { school: "rv", name: "11E1", year: 11, subject: "English", teacher: "wilson", size: 22, work: [["persuasive", 5], ["market", 0]] },
  { school: "rv", name: "8S1", year: 8, subject: "Science", teacher: "bell", size: 29, work: [["particles", 3], ["cells", 1]] },
  { school: "rv", name: "10S2", year: 10, subject: "Science", teacher: "kerr", size: 25, work: [["cells", 4], ["particles", 0]] },
  // Hillcrest: joined three weeks ago, and uses the AI less so far.
  { school: "hc", name: "9M1", year: 9, subject: "Mathematics", teacher: "kearney", size: 26, work: [["fractions", 3], ["algebra", 1]] },
  { school: "hc", name: "10M4", year: 10, subject: "Mathematics", teacher: "kearney", size: 24, work: [["algebra", 2]] },
  { school: "hc", name: "8E1", year: 8, subject: "English", teacher: "reid", size: 28, work: [["techniques", 3], ["market", 0]] },
  { school: "hc", name: "10E1", year: 10, subject: "English", teacher: "reid", size: 25, work: [["persuasive", 2]] },
  { school: "hc", name: "9S3", year: 9, subject: "Science", teacher: "murphy", size: 27, work: [["cells", 2], ["particles", 0]] },
];

// Invented names. Kept clear of the names written inside the demo essays.
const FIRST = ["Aoibhinn", "Cian", "Eabha", "Darragh", "Grainne", "Ronan", "Isla", "Conor", "Nell", "Fionn", "Ava", "Senan", "Clodagh", "Odhran", "Molly", "Tadhg", "Ruby", "Cathal", "Zara", "Eamon", "Tilly", "Lorcan", "Ivy", "Padraig", "Hollie", "Shay", "Esme", "Kian", "Lily", "Ciaran"];
const LAST = ["Ardagh", "Brennock", "Caskey", "Dornan", "Ervine", "Fearon", "Glendinning", "Hamill", "Irwin", "Jordan", "Kernaghan", "Lavery", "Magowan", "Neeson", "O'Prey", "Pollock", "Quigg", "Rodgers", "Shields", "Toner", "Uprichard", "Vallely", "Whiteside", "Yarr"];

/** Pick bank answers for a pupil of a given ability (0 weak .. 1 strong). Banks list the best answers first. */
function chooseFor(t: Template, ability: number, r: () => number): Choice {
  if (t.workType === "essay") {
    const order = t.essays.map((e, i) => ({ i, q: e.lines.reduce((n, l) => n + l.awarded, 0) })).sort((a, b) => b.q - a.q);
    const k = Math.min(order.length - 1, Math.floor((1 - ability) * order.length + (r() - 0.5)));
    return [order[Math.max(0, k)]!.i];
  }
  return t.answers.map((bank) => {
    if (r() < ability) return r() < 0.75 ? 0 : Math.min(1, bank.length - 1);
    return Math.floor(r() * bank.length);
  });
}

const iso = (d: Date) => d.toISOString();

export async function seedDemo(adminUrl: string, pupilNameKey: string, now = new Date()): Promise<{ classes: number; pupils: number; submissions: number }> {
  const r = rng(20261019);
  const sql = postgres(adminUrl, { max: 1, onnotice: () => {} });
  // "Set w weeks ago" counts back from now, so the latest work is a few days
  // old whatever day of the week the seed runs.
  const weekStart = (w: number) => new Date(now.getTime() - (w * 7 + 5) * DAY);
  const clamp = (d: Date) => (d.getTime() > now.getTime() - HOUR ? null : d);

  const passwordHash = await hashPassword(DEMO_PASSWORD);
  const teacherId = new Map<string, string>();
  const users: Record<string, unknown>[] = [];
  for (const t of TEACHERS) {
    const id = t.id ?? crypto.randomUUID();
    teacherId.set(t.key, id);
    if (!t.id) {
      const [first, last] = t.name.split(" ");
      users.push({
        id,
        authority_id: IDS.authorityDemo,
        school_id: SCHOOLS[t.school].id,
        email: `${first![0]!.toLowerCase()}.${last!.toLowerCase().replace(/[^a-z]/g, "")}@${SCHOOLS[t.school].domain}`,
        display_name: t.name,
        role: "teacher",
        password_hash: passwordHash,
      });
    }
  }

  const rows = {
    class: [] as Record<string, unknown>[],
    class_teacher: [] as Record<string, unknown>[],
    pupil: [] as Record<string, unknown>[],
    assignment: [] as Record<string, unknown>[],
    submission: [] as Record<string, unknown>[],
    mark_result: [] as Record<string, unknown>[],
    mark_line: [] as Record<string, unknown>[],
    approval: [] as Record<string, unknown>[],
    audit_event: [] as Record<string, unknown>[],
  };
  const audit = (actor: string, schoolId: string, action: string, at: Date, targetType: string, targetId: string, metadata: Record<string, unknown> = {}) =>
    rows.audit_event.push({ actor_id: actor, authority_id: IDS.authorityDemo, school_id: schoolId, action, target_type: targetType, target_id: targetId, metadata: sql.json(metadata as never), created_at: iso(at) });
  const activeDays = new Set<string>();

  let pupilCount = 0;
  for (const plan of CLASSES) {
    const school = SCHOOLS[plan.school];
    const tid = teacherId.get(plan.teacher)!;
    const classId = crypto.randomUUID();
    rows.class.push({ id: classId, school_id: school.id, name: plan.name, year_group: plan.year, subject: plan.subject, created_at: iso(weekStart(school.startWeek + 1)) });
    rows.class_teacher.push({ class_id: classId, user_id: tid, school_id: school.id });

    const pupils = Array.from({ length: plan.size }, (_, i) => {
      const id = crypto.randomUUID();
      const n = pupilCount++;
      const name = `${FIRST[(n * 7) % FIRST.length]} ${LAST[(n * 11) % LAST.length]}`;
      rows.pupil.push({
        id,
        class_id: classId,
        school_id: school.id,
        code: `${school.prefix}${plan.name}-${String(i + 1).padStart(2, "0")}`,
        // A few pupils have no name recorded: the name column is optional.
        display_name_enc: i % 9 === 8 ? null : encryptText(name, pupilNameKey),
      });
      return { id, ability: Math.min(0.95, Math.max(0.1, 0.25 + r() * 0.7)) };
    });

    const work: [string, number, boolean][] = plan.work.map(([k, w]) => [k, w, false]);
    if (plan.live) work.push([plan.live, 0, true]);
    for (const [key, weeksAgo, live] of work) {
      const t = templateByKey(key);
      // Live work was set yesterday, so it is waiting to be marked.
      const set = live ? new Date(now.getTime() - DAY) : new Date(weekStart(weeksAgo).getTime() + Math.floor(r() * 2) * DAY + Math.floor(r() * 6) * HOUR);
      if (set > now) continue;
      const assignmentId = crypto.randomUUID();
      rows.assignment.push({
        id: assignmentId,
        class_id: classId,
        school_id: school.id,
        title: t.title,
        work_type: t.workType,
        scheme_text: t.schemeText,
        total_marks: t.totalMarks,
        criteria: sql.json(t.criteria),
        created_by: tid,
        created_at: iso(set),
        updated_at: iso(set),
      });
      audit(tid, school.id, "assignment.created", set, "assignment", assignmentId, { workType: t.workType });
      const usesAi = !live && r() < school.adoption;
      const runAt = new Date(set.getTime() + 2 * DAY + Math.floor(r() * 8) * HOUR);
      let queued = 0;

      for (const p of pupils) {
        const choice = chooseFor(t, p.ability, r);
        const created = new Date(set.getTime() + (live ? r() * 12 * HOUR : (1 + r() * 2) * DAY));
        if (created > now) continue;
        const id = crypto.randomUUID();
        const base = { id, assignment_id: assignmentId, pupil_id: p.id, class_id: classId, school_id: school.id, created_at: iso(created), updated_at: iso(created) };
        if (live) {
          rows.submission.push({ ...base, text: pupilText(t, choice), status: "todo" });
          continue;
        }
        if (r() < 0.03) {
          rows.submission.push({ ...base, text: null, absent: true, status: "todo" });
          continue;
        }
        // What has happened to this script by now, by how long ago the work was set.
        const roll = r();
        const approvedAt = clamp(new Date(Math.max(created.getTime(), runAt.getTime()) + (4 + r() * 66) * HOUR));
        let state: "todo" | "review" | "approved" | "failed" =
          weeksAgo >= 2 ? (roll < 0.96 ? "approved" : "review") : weeksAgo === 1 ? (roll < 0.65 ? "approved" : roll < 0.92 ? "review" : roll < 0.95 ? "failed" : "todo") : roll < 0.15 ? "approved" : roll < 0.6 ? "review" : roll < 0.64 ? "failed" : "todo";
        if (state === "approved" && !approvedAt) state = "review";
        if (!usesAi && state === "failed") state = "todo";
        if (!usesAi && state === "review") state = "todo";
        if (usesAi && runAt > now) state = "todo";
        const text = pupilText(t, choice);
        if (state === "todo") {
          rows.submission.push({ ...base, text, status: "todo" });
          continue;
        }
        if (state === "failed") {
          rows.submission.push({ ...base, text, status: "failed", failure_reason: "The AI service did not respond in time. Try marking again." });
          queued++;
          continue;
        }

        const ai = usesAi ? resultFor(t, choice) : null;
        const finalMarks = teacherMarks(t, choice);
        // Sometimes a teacher disagrees with the AI by two marks on one line,
        // mostly on borderline essay bands, so agreement is believable, not perfect.
        if (ai && r() < (t.workType === "essay" ? 0.18 : 0.05)) {
          const wide = t.criteria.map((c, i) => (c.max >= 3 ? i : -1)).filter((i) => i >= 0);
          if (wide.length) {
            const i = wide[Math.floor(r() * wide.length)]!;
            finalMarks[i] = finalMarks[i]! >= 2 ? finalMarks[i]! - 2 : Math.min(t.criteria[i]!.max, finalMarks[i]! + 2);
          }
        }
        // Now and then a teacher adjusts a mark by half or one, as real teachers do.
        if (r() < 0.06) {
          const i = Math.floor(r() * finalMarks.length);
          const step = r() < 0.5 ? 0.5 : 1;
          finalMarks[i] = Math.max(0, Math.min(t.criteria[i]!.max, finalMarks[i]! + (r() < 0.5 ? -step : step)));
        }
        const runId = crypto.randomUUID();
        const runTime = ai ? new Date(Math.max(created.getTime(), runAt.getTime()) + r() * HOUR) : new Date(created.getTime() + r() * DAY);
        if (ai) queued++;
        rows.mark_result.push({
          id: runId,
          submission_id: id,
          class_id: classId,
          school_id: school.id,
          assignment_id: assignmentId,
          scheme_version: 1,
          run_number: 1,
          source: ai ? "ai" : "manual",
          model: ai ? "demo-seed" : null,
          prompt_version: ai ? PROMPT_VERSION : null,
          confidence: ai?.confidence ?? null,
          flags: sql.json(ai?.flags ?? []),
          transcription: null,
          feedback_draft: ai?.feedback || null,
          tokens_in: ai ? 2200 + Math.floor(r() * 900) : null,
          tokens_out: ai ? 280 + Math.floor(r() * 160) : null,
          cache_read_tokens: ai ? 1600 : null,
          latency_ms: ai ? 4000 + Math.floor(r() * 9000) : null,
          created_by: tid,
          created_at: iso(runTime),
        });
        const approved = state === "approved";
        t.criteria.forEach((c, i) => {
          rows.mark_line.push({
            mark_result_id: runId,
            class_id: classId,
            school_id: school.id,
            position: i,
            label: c.label,
            max: c.max,
            ai_awarded: ai ? ai.criteria[i]!.awarded : null,
            final_awarded: approved || !ai ? finalMarks[i] : null,
            evidence: ai ? ai.criteria[i]!.evidence : null,
            ai_comment: ai ? ai.criteria[i]!.comment : null,
          });
        });
        const feedback = ai?.feedback ?? (approved ? "Well done. See my comments on each question." : null);
        rows.submission.push({ ...base, text, status: "pending:" + state, feedback: approved ? feedback : null });
        if (approved) {
          const aiTotal = ai ? ai.criteria.reduce((n, c) => n + c.awarded, 0) : null;
          const total = finalMarks.reduce((n, m) => n + m, 0);
          rows.approval.push({
            submission_id: id,
            class_id: classId,
            school_id: school.id,
            mark_result_id: runId,
            approved_by: tid,
            approved_at: iso(approvedAt!),
            final_total: total,
            final_feedback: feedback,
            ai_total: aiTotal,
            lines_changed: ai ? finalMarks.filter((m, i) => m !== ai.criteria[i]!.awarded).length : null,
          });
          audit(tid, school.id, "submission.approved", approvedAt!, "submission", id, { assignmentId, total, outOf: t.totalMarks, run: 1, source: ai ? "ai" : "manual" });
          activeDays.add(`${tid}|${school.id}|${approvedAt!.toISOString().slice(0, 10)}`);
        }
      }
      if (queued) {
        audit(tid, school.id, "marking.requested", runAt, "assignment", assignmentId, { queued });
        activeDays.add(`${tid}|${school.id}|${runAt.toISOString().slice(0, 10)}`);
      }
    }
  }
  for (const d of activeDays) {
    const [tid, sid, day] = d.split("|");
    rows.audit_event.push({ actor_id: tid, authority_id: IDS.authorityDemo, school_id: sid, action: "auth.login", target_type: "user", target_id: tid, metadata: sql.json({}), created_at: `${day}T08:${String(Math.floor(r() * 50)).padStart(2, "0")}:00Z` });
  }

  // Submissions go in unapproved, so their marks can be written; then approved.
  const finalStatus = new Map<string, string>();
  for (const s of rows.submission) {
    const st = String(s.status);
    if (st.startsWith("pending:")) {
      finalStatus.set(String(s.id), st.slice(8));
      s.status = "review";
    }
  }
  const insert = async (tx: postgres.TransactionSql, table: keyof typeof rows | "app_user", list: Record<string, unknown>[]) => {
    for (let i = 0; i < list.length; i += 500) {
      const chunk = list.slice(i, i + 500);
      // Every row in a table gets the same columns, so missing ones are explicit nulls.
      const cols = [...new Set(chunk.flatMap((x) => Object.keys(x)))];
      const filled = chunk.map((x) => Object.fromEntries(cols.map((c) => [c, x[c] ?? (c === "absent" ? false : null)])));
      await tx`insert into ${tx(table)} ${tx(filled as never, cols as never)}`;
    }
  };

  try {
    await sql.begin(async (tx) => {
      await insert(tx, "app_user", users);
      for (const t of ["class", "class_teacher", "pupil", "assignment", "submission", "mark_result", "mark_line"] as const) await insert(tx, t, rows[t]);
      const toApprove = [...finalStatus.entries()].filter(([, s]) => s === "approved").map(([id]) => id);
      await insert(tx, "approval", rows.approval);
      for (let i = 0; i < toApprove.length; i += 500) {
        await tx`
          update submission s set status = 'approved', delete_after = a.approved_at + make_interval(days => au.retention_days), updated_at = a.approved_at
          from approval a, school sc, authority au
          where s.id = any(${toApprove.slice(i, i + 500)}::uuid[]) and a.submission_id = s.id and a.reopened_at is null
            and sc.id = s.school_id and au.id = sc.authority_id`;
      }
      await insert(tx, "audit_event", rows.audit_event);
    });
    // Work approved more than the retention period ago is deleted now, as the hourly job would have done.
    await sql`select * from app_run_retention(100000)`;
  } finally {
    await sql.end();
  }
  return { classes: rows.class.length, pupils: rows.pupil.length, submissions: rows.submission.length };
}
