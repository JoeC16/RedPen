// First line of defence, end to end through the actual route handlers: for
// every API route, a user from school A gets nothing from school B.
import { mkdtempSync, readdirSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { addPhoto } from "@/server/dal/photos";
import { closeDb } from "@/server/db/client";
import { setStorageForTests } from "@/server/storage";
import { LocalStorage } from "@/server/storage/local";
import { signedFileUrl } from "@/server/storage/signed-url";
import { IDS, adminConn, ctxOf, type FixtureUser } from "../helpers";

const session = vi.hoisted(() => ({ userId: null as string | null }));
vi.mock("@/auth", () => ({
  auth: async () => (session.userId ? { user: { id: session.userId } } : null),
  signIn: vi.fn(),
  signOut: vi.fn(),
  handlers: {},
}));

beforeAll(async () => {
  setStorageForTests(new LocalStorage(mkdtempSync(path.join(tmpdir(), "redpen-routes-"))));
  const owners: [School, FixtureUser, string][] = [
    ["A", "northgateTeacher1", IDS.assignmentNorthgateSci],
    ["B", "riversideTeacher", IDS.assignmentRiversideSci],
    ["C", "otherTeacher", IDS.assignmentOtherMaths],
  ];
  for (const [school, who, assignmentId] of owners) {
    const code = { A: "NG9S06", B: "RV9X06", C: "OT11A06" }[school];
    const r = await addPhoto(await ctxOf(who), assignmentId, { fileName: `${code}.jpg`, bytes: TINY_JPEG, namesConfirmed: true });
    fileIds[school] = r.fileId;
  }
});

afterAll(async () => {
  await adminConn()`delete from submission where assignment_id in (${IDS.assignmentNorthgateSci}, ${IDS.assignmentRiversideSci}, ${IDS.assignmentOtherMaths})`;
  await adminConn().end();
  setStorageForTests(undefined);
  await closeDb();
});
beforeEach(() => {
  session.userId = null;
});

type Handler = (req: Request, ctx: { params: Promise<Record<string, string>> }) => Promise<Response>;

type School = "A" | "B" | "C";
type RouteSpec = {
  load: () => Promise<unknown>;
  target: (school: School) => Record<string, string>;
  method?: "GET" | "POST";
  /** Build the request (body, signed query) for this caller. */
  request?: (url: string, userId: string, school: School) => Request;
};

/** One fixture photo per school, created in beforeAll for the file route. */
const fileIds: Record<School, string> = { A: "", B: "", C: "" };

/** Every API route, with the params needed to aim it at a given school's data. */
const ROUTES: Record<string, RouteSpec> = {
  "api/me": { load: () => import("@/app/api/me/route"), target: () => ({}) },
  "api/schools": { load: () => import("@/app/api/schools/route"), target: () => ({}) },
  "api/schools/[schoolId]": {
    load: () => import("@/app/api/schools/[schoolId]/route"),
    target: (s) => ({ schoolId: { A: IDS.schoolNorthgate, B: IDS.schoolRiverside, C: IDS.schoolOther }[s] }),
  },
  "api/classes": { load: () => import("@/app/api/classes/route"), target: () => ({}) },
  "api/classes/[classId]": {
    load: () => import("@/app/api/classes/[classId]/route"),
    target: (s) => ({ classId: { A: IDS.classNorthgateSci, B: IDS.classRiversideSci, C: IDS.classOtherMaths }[s] }),
  },
  "api/classes/[classId]/pupils": {
    load: () => import("@/app/api/classes/[classId]/pupils/route"),
    target: (s) => ({ classId: { A: IDS.classNorthgateSci, B: IDS.classRiversideSci, C: IDS.classOtherMaths }[s] }),
  },
  "api/audit": { load: () => import("@/app/api/audit/route"), target: () => ({}) },
  "api/assignments/[assignmentId]/export": {
    load: () => import("@/app/api/assignments/[assignmentId]/export/route"),
    target: (s) => ({ assignmentId: { A: IDS.assignmentNorthgateSci, B: IDS.assignmentRiversideSci, C: IDS.assignmentOtherMaths }[s] }),
  },
  "api/assignments/[assignmentId]/photos": {
    load: () => import("@/app/api/assignments/[assignmentId]/photos/route"),
    method: "POST",
    target: (s) => ({ assignmentId: { A: IDS.assignmentNorthgateSci, B: IDS.assignmentRiversideSci, C: IDS.assignmentOtherMaths }[s] }),
    request: (url, _userId, s) => {
      const body = new FormData();
      // Named with a pupil code from the targeted school, so a leak would succeed.
      body.set("file", new File([TINY_JPEG], `${{ A: "NG9S01", B: "RV9X01", C: "OT11A01" }[s]}.jpg`, { type: "image/jpeg" }));
      body.set("namesConfirmed", "yes");
      return new Request(url, { method: "POST", body });
    },
  },
  "api/files/[fileId]": {
    load: () => import("@/app/api/files/[fileId]/route"),
    target: (s) => ({ fileId: fileIds[s] }),
    // A correctly signed link for the caller: the route must still refuse other schools' files.
    request: (url, userId, s) => new Request(`http://localhost${signedFileUrl(fileIds[s], userId)}`),
  },
};

const TINY_JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xda, 0, 4, 1, 0, 0x11, 0x22, 0xff, 0xd9]);

/** Routes that are deliberately not tenant-scoped. */
const EXEMPT = new Set(["api/auth/[...nextauth]", "api/health"]);

async function handler(route: string): Promise<Handler> {
  const mod = (await ROUTES[route]!.load()) as Record<string, Handler>;
  return mod[ROUTES[route]!.method ?? "GET"]!;
}

function discoverRoutes(dir: string, base = dir): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return discoverRoutes(full, base);
    return name === "route.ts" ? [path.relative(base, path.dirname(full)).split(path.sep).join("/")] : [];
  });
}

async function call(route: string, as: FixtureUser | null, school: "A" | "B" | "C" = "A", query = "") {
  session.userId = as ? IDS[as] : null;
  const r = ROUTES[route]!;
  const GET = await handler(route);
  const params = r.target(school);
  const url = `http://localhost/${route.replace(/\[(\w+)\]/g, (_, k: string) => params[k] ?? "")}${query}`;
  const req = r.request ? r.request(url, session.userId ?? "anonymous", school) : new Request(url);
  const res = await GET(req, { params: Promise.resolve(params) });
  const text = await res.text();
  const body = res.headers.get("content-type")?.includes("json") ? (JSON.parse(text) as Record<string, unknown>) : { raw: text };
  return { status: res.status, body };
}

describe("route inventory", () => {
  it("every API route is covered by the cross-tenant tests or explicitly exempt", () => {
    const found = discoverRoutes(path.resolve(import.meta.dirname, "../../src/app")).sort();
    const covered = [...Object.keys(ROUTES), ...EXEMPT].sort();
    expect(found).toEqual(covered);
  });
});

describe("unauthenticated", () => {
  for (const route of Object.keys(ROUTES)) {
    it(`${route} returns 401`, async () => {
      expect((await call(route, null)).status).toBe(401);
    });
  }
});

describe("cross-school and cross-authority access", () => {
  const otherSchoolIds = [
    IDS.schoolRiverside, IDS.classRiversideSci, IDS.riversideTeacher, IDS.assignmentRiversideSci,
    IDS.schoolOther, IDS.classOtherMaths, IDS.otherTeacher, IDS.assignmentOtherMaths,
    "RV9X", "OT11A", // pupil code prefixes from other schools
  ];

  // For every route, every school-level user, aimed at another school's data:
  // the response is 404/403 or contains none of the other school's ids.
  const users: FixtureUser[] = ["northgateTeacher1", "northgateTeacher2", "northgateAdmin", "hillcrestAdmin"];
  for (const route of Object.keys(ROUTES)) {
    for (const user of users) {
      for (const school of ["B", "C"] as const) {
        it(`${user} → ${route} aimed at school ${school} leaks nothing`, async () => {
          const res = await call(route, user, school);
          expect([200, 403, 404]).toContain(res.status);
          const body = JSON.stringify(res.body);
          for (const foreign of otherSchoolIds) expect(body).not.toContain(foreign);
        });
      }
    }
  }

  it("a teacher gets 404 for another school's class and its pupils", async () => {
    expect((await call("api/classes/[classId]", "northgateTeacher1", "B")).status).toBe(404);
    expect((await call("api/classes/[classId]/pupils", "northgateTeacher1", "B")).status).toBe(404);
    expect((await call("api/schools/[schoolId]", "northgateTeacher1", "B")).status).toBe(404);
  });

  it("a teacher gets 404 for a colleague's class in the same school", async () => {
    session.userId = IDS.northgateTeacher2;
    const GET = await handler("api/classes/[classId]");
    const res = await GET(new Request("http://localhost/x"), { params: Promise.resolve({ classId: IDS.classNorthgateSci }) });
    expect(res.status).toBe(404);
  });

  it("the authority admin sees their schools but no other authority's", async () => {
    const res = await call("api/schools", "authorityAdmin");
    const schools = (res.body.schools as { id: string }[]).map((s) => s.id).sort();
    expect(schools).toEqual([IDS.schoolNorthgate, IDS.schoolRiverside, IDS.schoolHillcrest].sort());
    expect((await call("api/schools/[schoolId]", "authorityAdmin", "C")).status).toBe(404);
  });

  it("the authority admin cannot open classes or pupils, even in their own schools", async () => {
    expect((await call("api/classes", "authorityAdmin")).status).toBe(403);
    expect((await call("api/classes/[classId]", "authorityAdmin", "A")).status).toBe(403);
    expect((await call("api/classes/[classId]/pupils", "authorityAdmin", "A")).status).toBe(403);
  });

  it("a teacher gets 404 exporting another school's or a colleague's assignment", async () => {
    expect((await call("api/assignments/[assignmentId]/export", "northgateTeacher1", "B")).status).toBe(404);
    expect((await call("api/assignments/[assignmentId]/export", "northgateTeacher2", "A")).status).toBe(404);
  });

  it("admins cannot export pupil marks", async () => {
    expect((await call("api/assignments/[assignmentId]/export", "northgateAdmin", "A")).status).toBe(403);
    expect((await call("api/assignments/[assignmentId]/export", "authorityAdmin", "A")).status).toBe(403);
  });

  it("an upload aimed at another school's assignment is refused and stores nothing", async () => {
    const before = await adminConn()`select count(*)::int as n from submission_file where school_id <> ${IDS.schoolNorthgate}`;
    for (const school of ["B", "C"] as const) {
      expect((await call("api/assignments/[assignmentId]/photos", "northgateTeacher1", school)).status).toBe(404);
      expect((await call("api/assignments/[assignmentId]/photos", "northgateAdmin", school)).status).toBe(403);
    }
    const after = await adminConn()`select count(*)::int as n from submission_file where school_id <> ${IDS.schoolNorthgate}`;
    expect(after[0]!.n).toBe(before[0]!.n);
  });

  it("a photo link needs a valid signature for this user, even for the class teacher", async () => {
    session.userId = IDS.northgateTeacher1;
    const GET = await handler("api/files/[fileId]");
    const params = { params: Promise.resolve({ fileId: fileIds.A }) };
    const good = signedFileUrl(fileIds.A, IDS.northgateTeacher1);
    expect((await GET(new Request(`http://localhost${good}`), params)).status).toBe(200);
    expect((await GET(new Request(`http://localhost/api/files/${fileIds.A}`), params)).status).toBe(403);
    const forSomeoneElse = signedFileUrl(fileIds.A, IDS.northgateAdmin);
    expect((await GET(new Request(`http://localhost${forSomeoneElse}`), params)).status).toBe(403);
    const res = await GET(new Request(`http://localhost${good}`), params);
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
  });

  it("teachers cannot read the audit log", async () => {
    expect((await call("api/audit", "northgateTeacher1")).status).toBe(403);
  });

  it("malformed ids are a 404, not an error", async () => {
    session.userId = IDS.northgateTeacher1;
    const GET = await handler("api/classes/[classId]");
    const res = await GET(new Request("http://localhost/x"), { params: Promise.resolve({ classId: "' or 1=1 --" }) });
    expect(res.status).toBe(404);
  });

  it("a disabled user gets 401 even with a valid session", async () => {
    expect((await call("api/me", "northgateDisabled")).status).toBe(401);
  });
});

describe("same-school access still works", () => {
  it("the class teacher exports a CSV with every pupil and a formula-safe header", async () => {
    const res = await call("api/assignments/[assignmentId]/export", "northgateTeacher1", "A");
    expect(res.status).toBe(200);
    const lines = String(res.body.raw).replace(/^\uFEFF/, "").trim().split("\r\n");
    expect(lines[0]).toBe("Pupil code,Name,Status,Q1 (/1),Q2 (/2),Q3 (/2),Q4 (/1),Q5 (/2),Total (/8),Feedback,Approved at,Approved by");
    expect(lines).toHaveLength(7);
    expect(lines.slice(1).every((l) => l.includes("not approved"))).toBe(true);
  });

  it("teacher sees their own class and its pupils with names", async () => {
    const res = await call("api/classes/[classId]/pupils", "northgateTeacher1", "A");
    expect(res.status).toBe(200);
    const pupils = res.body.pupils as { code: string; displayName: string | null }[];
    expect(pupils).toHaveLength(6);
    expect(pupils.filter((p) => p.displayName).length).toBe(5);
  });

  it("school admin sees pupil codes but not names", async () => {
    const res = await call("api/classes/[classId]/pupils", "northgateAdmin", "A");
    expect(res.status).toBe(200);
    expect((res.body.pupils as { displayName: string | null }[]).every((p) => p.displayName === null)).toBe(true);
  });

  it("school admin's audit search is confined to their school", async () => {
    const res = await call("api/audit", "northgateAdmin");
    expect(res.status).toBe(200);
    const events = res.body.events as { schoolName: string | null }[];
    expect(events.every((e) => e.schoolName === "Northgate High School")).toBe(true);
  });

  it("rejects an invalid audit filter", async () => {
    expect((await call("api/audit", "northgateAdmin", "A", "?from=yesterday")).status).toBe(400);
  });
});
