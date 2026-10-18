// Photos of pupil work: upload with the names-cropped confirmation, metadata
// removal, bulk matching by pupil code, locking, who can see them, and marking
// from photos with the transcription shown to the teacher.
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createAssignment } from "@/server/dal/assignments";
import { approve, getReview, MarkingError, reopen, reviewQueue, saveMarks, startMarking } from "@/server/dal/marking";
import { addPhoto, deletePhoto, readPhoto } from "@/server/dal/photos";
import { closeDb } from "@/server/db/client";
import { DemoProvider } from "@/server/marking/demo";
import { runMarkingJob } from "@/server/marking/engine";
import type { MarkingProvider, MarkingRequest } from "@/server/marking/provider";
import { setEnqueueForTests } from "@/server/marking/queue";
import { setStorageForTests } from "@/server/storage";
import { LocalStorage } from "@/server/storage/local";
import { ForbiddenError } from "@/server/tenancy";
import type { SessionUser } from "@/server/user-context";
import { SCIENCE_SCHEME } from "../../scripts/lib/fixtures";
import { IDS, adminConn, appConn, asApp, ctxOf, rawCtxOf } from "../helpers";

/** A small JPEG-shaped file with EXIF carrying a GPS marker. */
function photo(label = "page"): Buffer {
  const exif = Buffer.concat([Buffer.from("Exif\0\0MM\0*\0\0\0\x08\0\0", "binary"), Buffer.from(`GPS 54.6N ${label}`)]);
  const app1 = Buffer.concat([Buffer.from([0xff, 0xe1]), Buffer.from([0, exif.length + 2]), exif]);
  return Buffer.concat([Buffer.from([0xff, 0xd8]), app1, Buffer.from([0xff, 0xda, 0, 4, 1, 0]), Buffer.from(`pixels-${label}`), Buffer.from([0xff, 0xd9])]);
}

let t1: SessionUser;
let aid: string;
let pupils: { id: string; code: string }[];
let store: LocalStorage;
let storeDir: string;
const jobs: { submissionId: string; requestedBy: string }[] = [];

beforeAll(async () => {
  storeDir = mkdtempSync(path.join(tmpdir(), "redpen-photos-"));
  store = new LocalStorage(storeDir);
  setStorageForTests(store);
  setEnqueueForTests(async (j) => void jobs.push(...j));
  t1 = await ctxOf("northgateTeacher1");
  aid = (await createAssignment(t1, IDS.classNorthgateSci, { ...SCIENCE_SCHEME, workType: "maths", title: "Photo test" }))!;
  pupils = await adminConn()<{ id: string; code: string }[]>`select id, code from pupil where class_id = ${IDS.classNorthgateSci} order by code`;
});

afterAll(async () => {
  setStorageForTests(undefined);
  setEnqueueForTests(undefined);
  await adminConn()`delete from assignment where id = ${aid}`;
  await appConn().end();
  await adminConn().end();
  await closeDb();
});

const upload = (who: SessionUser, over: Partial<Parameters<typeof addPhoto>[2]> = {}) =>
  addPhoto(who, aid, { pupilId: pupils[0]!.id, fileName: "page.jpg", bytes: photo(), namesConfirmed: true, ...over });

describe("uploading", () => {
  it("refuses without the names-cropped confirmation", async () => {
    await expect(upload(t1, { namesConfirmed: false })).rejects.toThrow(/Confirm that pupil names are cropped out/);
  });

  it("stores the photo with metadata removed and records the confirmation", async () => {
    const r = await upload(t1);
    expect(r).toMatchObject({ pupilCode: pupils[0]!.code, position: 1 });
    const [row] = await adminConn()`select storage_key, content_type, names_confirmed_by, names_confirmed_at from submission_file where id = ${r.fileId}`;
    expect(row).toMatchObject({ content_type: "image/jpeg", names_confirmed_by: IDS.northgateTeacher1 });
    expect(row!.names_confirmed_at).toBeInstanceOf(Date);
    expect(String(row!.storage_key)).not.toContain(pupils[0]!.code); // keys never carry pupil identifiers
    const stored = await store.get(String(row!.storage_key));
    expect(stored.toString("binary")).not.toContain("GPS");
    expect(stored.toString("binary")).toContain("pixels-page");
    const [ev] = await adminConn()`select metadata from audit_event where action = 'photo.uploaded' and metadata->>'fileId' = ${r.fileId}`;
    expect(ev?.metadata).toMatchObject({ namesConfirmed: true, page: 1 });
  });

  it("numbers further pages in order", async () => {
    expect((await upload(t1, { bytes: photo("p2") })).position).toBe(2);
  });

  it("matches bulk uploads to pupils by the code at the start of the file name", async () => {
    const r = await upload(t1, { pupilId: undefined, fileName: `${pupils[1]!.code.toLowerCase()}-1.jpg` });
    expect(r.pupilCode).toBe(pupils[1]!.code);
    await expect(upload(t1, { pupilId: undefined, fileName: "IMG_2041.jpg" })).rejects.toThrow(/does not start with a pupil code/);
    // A code from another class in the school is not matched.
    await expect(upload(t1, { pupilId: undefined, fileName: "NG8E01.jpg" })).rejects.toThrow(/does not start with a pupil code/);
  });

  it("rejects files that are not photos", async () => {
    await expect(upload(t1, { bytes: Buffer.from("%PDF-1.7 ...") })).rejects.toThrow(/JPEG, PNG or WebP/);
  });

  it("is refused for colleagues, other schools and admins", async () => {
    await expect(upload(await ctxOf("northgateTeacher2"))).rejects.toThrow(/not found/);
    await expect(upload(await ctxOf("riversideTeacher"))).rejects.toThrow(/not found/);
    await expect(upload(await ctxOf("northgateAdmin"))).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe("viewing", () => {
  it("the class teacher and the school admin can read a photo; nobody else can", async () => {
    const { fileId: id } = await upload(t1, { pupilId: pupils[5]!.id });
    expect((await readPhoto(t1, id))?.contentType).toBe("image/jpeg");
    expect(await readPhoto(await ctxOf("northgateAdmin"), id)).not.toBeNull();
    expect(await readPhoto(await ctxOf("northgateTeacher2"), id)).toBeNull();
    expect(await readPhoto(await ctxOf("riversideTeacher"), id)).toBeNull();
    expect(await readPhoto(await ctxOf("riversideAdmin"), id)).toBeNull();
    await expect(readPhoto(await ctxOf("authorityAdmin"), id)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("the database hides photo records from colleagues and other schools", async () => {
    for (const key of ["northgateTeacher2", "riversideTeacher", "authorityAdmin"] as const) {
      expect(await asApp(await rawCtxOf(key), (sql) => sql`select * from submission_file`)).toHaveLength(0);
    }
  });

  it("the review screen lists the photos with short-lived signed links", async () => {
    const v = await getReview(t1, aid, pupils[0]!.id);
    expect(v?.photos.map((p) => p.position)).toEqual([1, 2]);
    expect(v?.photos[0]?.url).toMatch(/^\/api\/files\/[0-9a-f-]{36}\?e=\d+&s=[\w-]+$/);
    const q = await reviewQueue(t1, aid);
    expect(q?.rows.find((r) => r.pupilId === pupils[0]!.id)).toMatchObject({ hasWork: true, photoCount: 2 });
  });
});

describe("marking from photos", () => {
  it("photo-only work is sent for marking, with the photos as images and no names", async () => {
    jobs.length = 0;
    expect((await startMarking(t1, aid, pupils[0]!.id)).queued).toBe(1);
    const seen: MarkingRequest[] = [];
    const spy: MarkingProvider = { name: "demo", mark: (r) => (seen.push(r), new DemoProvider().mark(r)) };
    await runMarkingJob({ ...jobs[0]!, jobId: "photo-job-1" }, { finalAttempt: true, provider: spy });
    expect(seen[0]!.images).toHaveLength(2);
    expect(seen[0]!.images![0]!.mediaType).toBe("image/jpeg");
    expect(seen[0]!.images![0]!.data.toString("binary")).not.toContain("GPS");
    expect(seen[0]!.pupilText).toBe("");
  });

  it("the transcription is stored and shown next to the photos", async () => {
    const v = await getReview(t1, aid, pupils[0]!.id);
    expect(v?.run?.transcription).toMatch(/Demo mode: the 2 photos were not read/);
    expect(v?.run?.flags[0]).toMatch(/photos are not read in demo mode/);
    // The run records exactly which photos it read.
    expect([...(v?.run?.inputFileIds ?? [])].sort()).toEqual(v!.photos.map((p) => p.id).sort());
  });
});

describe("locking and removal", () => {
  it("photos of approved work cannot be added or removed until it is reopened", async () => {
    const p = pupils[1]!;
    await saveMarks(t1, aid, p.id, { lines: [0, 1, 2, 3, 4].map((position) => ({ position, finalAwarded: 1, comment: null })), feedback: "" });
    await approve(t1, aid, p.id);
    await expect(upload(t1, { pupilId: p.id })).rejects.toBeInstanceOf(MarkingError);
    const [{ id }] = (await adminConn()`select f.id from submission_file f join submission s on s.id = f.submission_id where s.pupil_id = ${p.id} and s.assignment_id = ${aid}`) as unknown as [{ id: string }];
    await expect(deletePhoto(t1, id)).rejects.toBeInstanceOf(MarkingError);
    await expect(adminConn()`delete from submission_file where id = ${id}`).rejects.toThrow(/approved/);
    await reopen(t1, aid, p.id, "Wrong photo");
    expect(await deletePhoto(t1, id)).toBe(true);
  });

  it("removing a photo deletes the stored file, and colleagues cannot remove one", async () => {
    const r = await upload(t1, { pupilId: pupils[2]!.id });
    const [row] = (await adminConn()`select storage_key from submission_file where id = ${r.fileId}`) as unknown as [{ storage_key: string }];
    expect(await deletePhoto(await ctxOf("northgateTeacher2"), r.fileId)).toBe(false);
    expect(await deletePhoto(t1, r.fileId)).toBe(true);
    await expect(store.get(row.storage_key)).rejects.toThrow();
  });

  it("allows at most six photos per pupil", async () => {
    const p = pupils[3]!;
    for (let i = 0; i < 6; i++) await upload(t1, { pupilId: p.id, bytes: photo(`n${i}`) });
    await expect(upload(t1, { pupilId: p.id })).rejects.toThrow(/already has 6 photos/);
  });
});
