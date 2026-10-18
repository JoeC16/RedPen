import { and, asc, eq, sql } from "drizzle-orm";
import { recordAudit } from "../audit";
import type { Tx } from "../db/client";
import { pupil, schoolClass, submission, submissionFile } from "../db/schema";
import { storage } from "../storage";
import { signedFileUrl } from "../storage/signed-url";
import { withTenant, type Ctx } from "../tenancy";
import { codeFromFilename, ImageError, MAX_PHOTOS_PER_PUPIL, prepareImage, type ImageType } from "../uploads/image";
import { loadAssignment, reader } from "./assignments";
import { isUuid } from "./ids";
import { assertUnlocked, context, ensureSubmission, MarkingError, teacher } from "./marking";

export type PhotoView = { id: string; position: number; contentType: ImageType; url: string; originalName: string | null };

const ext: Record<ImageType, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

/** Photos of one submission, with short-lived signed links for the viewer. */
export async function photosFor(tx: Tx, ctx: Ctx & { schoolId: string }, submissionId: string): Promise<PhotoView[]> {
  const rows = await tx
    .select({ id: submissionFile.id, position: submissionFile.position, contentType: submissionFile.contentType, originalName: submissionFile.originalName })
    .from(submissionFile)
    .where(and(eq(submissionFile.schoolId, ctx.schoolId), eq(submissionFile.submissionId, submissionId)))
    .orderBy(asc(submissionFile.position));
  return rows.map((r) => ({ ...r, url: signedFileUrl(r.id, ctx.userId) }));
}

export type UploadResult = { pupilCode: string; position: number; fileId: string };

/**
 * Add one photographed page to a pupil's work. Photos cannot be redacted, so
 * the teacher must confirm names are cropped out or covered; the confirmation
 * is stored on the file and in the audit log. Metadata (EXIF, GPS) is removed.
 * With no pupilId, the pupil is found from the file name's leading pupil code.
 */
export async function addPhoto(
  ctx: Ctx,
  assignmentId: string,
  input: { pupilId?: string; fileName: string; bytes: Buffer; namesConfirmed: boolean },
): Promise<UploadResult> {
  const c = teacher(ctx);
  if (!input.namesConfirmed) {
    throw new MarkingError("Confirm that pupil names are cropped out or covered before uploading.");
  }
  let prepared;
  try {
    prepared = prepareImage(input.bytes);
  } catch (err) {
    if (err instanceof ImageError) throw new MarkingError(`${input.fileName}: ${err.message}`);
    throw err;
  }

  const key = `${c.schoolId}/${crypto.randomUUID()}.${ext[prepared.contentType]}`;
  const placed = await withTenant(c, async (tx) => {
    const a = await loadAssignment(tx, c, assignmentId);
    if (!a) throw new MarkingError("Assignment not found.");
    let pupilId = input.pupilId;
    if (!pupilId) {
      const pupils = await tx
        .select({ id: pupil.id, code: pupil.code })
        .from(pupil)
        .where(and(eq(pupil.schoolId, c.schoolId), eq(pupil.classId, a.classId)));
      const code = codeFromFilename(input.fileName, pupils.map((p) => p.code));
      if (!code) throw new MarkingError(`${input.fileName}: the file name does not start with a pupil code from ${a.className}.`);
      pupilId = pupils.find((p) => p.code === code)!.id;
    }
    if (!isUuid(pupilId)) throw new MarkingError("Pupil not found.");
    const found = await context(tx, c, assignmentId, pupilId);
    if (!found) throw new MarkingError("Pupil not found.");
    const s = await ensureSubmission(tx, c, found.a, found.p.id);
    assertUnlocked(s);
    if (s.absent) throw new MarkingError(`${found.p.code} is marked absent. Mark them present first.`);
    const [{ n, maxPos }] = (await tx
      .select({ n: sql<number>`count(*)::int`, maxPos: sql<number>`coalesce(max(${submissionFile.position}), 0)::int` })
      .from(submissionFile)
      .where(and(eq(submissionFile.schoolId, c.schoolId), eq(submissionFile.submissionId, s.id)))) as [{ n: number; maxPos: number }];
    if (n >= MAX_PHOTOS_PER_PUPIL) throw new MarkingError(`${found.p.code} already has ${MAX_PHOTOS_PER_PUPIL} photos, the most allowed.`);

    // Store first; if the database write then fails, the object is removed below.
    await storage().put(key, prepared.bytes, prepared.contentType);
    const id = crypto.randomUUID();
    const now = new Date();
    await tx.insert(submissionFile).values({
      id,
      submissionId: s.id,
      classId: s.classId,
      schoolId: c.schoolId,
      position: maxPos + 1,
      storageKey: key,
      contentType: prepared.contentType,
      bytes: prepared.bytes.length,
      originalName: input.fileName.split(/[\\/]/).pop()!.slice(0, 200),
      namesConfirmedBy: c.userId,
      namesConfirmedAt: now,
    });
    await tx
      .update(submission)
      .set({ absent: false, updatedAt: now })
      .where(and(eq(submission.schoolId, c.schoolId), eq(submission.id, s.id)));
    await recordAudit(tx, c, {
      action: "photo.uploaded",
      targetType: "submission",
      targetId: s.id,
      metadata: { fileId: id, page: maxPos + 1, bytes: prepared.bytes.length, namesConfirmed: true },
    });
    return { pupilCode: found.p.code, position: maxPos + 1, fileId: id };
  }).catch(async (err) => {
    await storage().delete(key).catch(() => {});
    throw err;
  });
  return placed;
}

/** Remove one photo (not from approved work). */
export async function deletePhoto(ctx: Ctx, fileId: string): Promise<boolean> {
  const c = teacher(ctx);
  if (!isUuid(fileId)) return false;
  const key = await withTenant(c, async (tx) => {
    const [f] = await tx
      .select({ id: submissionFile.id, key: submissionFile.storageKey, submissionId: submissionFile.submissionId, classId: submissionFile.classId })
      .from(submissionFile)
      .where(and(eq(submissionFile.schoolId, c.schoolId), eq(submissionFile.id, fileId)));
    if (!f) return null;
    const [s] = await tx.select().from(submission).where(and(eq(submission.schoolId, c.schoolId), eq(submission.id, f.submissionId)));
    if (!s || !(await loadAssignment(tx, c, s.assignmentId))) return null;
    assertUnlocked(s);
    await tx.delete(submissionFile).where(and(eq(submissionFile.schoolId, c.schoolId), eq(submissionFile.id, f.id)));
    await recordAudit(tx, c, { action: "photo.deleted", targetType: "submission", targetId: s.id, metadata: { fileId: f.id } });
    return f.key;
  });
  if (!key) return false;
  await storage().delete(key);
  return true;
}

/** The photo bytes, for a viewer who may see that pupil's work (class teacher or school admin). */
export async function readPhoto(ctx: Ctx, fileId: string): Promise<{ bytes: Buffer; contentType: ImageType } | null> {
  if (!isUuid(fileId)) return null;
  const c = reader(ctx);
  const f = await withTenant(c, async (tx) => {
    const [row] = await tx
      .select({ key: submissionFile.storageKey, contentType: submissionFile.contentType, submissionId: submissionFile.submissionId })
      .from(submissionFile)
      .innerJoin(schoolClass, eq(schoolClass.id, submissionFile.classId))
      .where(and(eq(submissionFile.schoolId, c.schoolId), eq(submissionFile.id, fileId)));
    if (!row) return null;
    // Same visibility rule as the work itself: the class teacher, or the school admin.
    const [s] = await tx.select({ a: submission.assignmentId }).from(submission).where(and(eq(submission.schoolId, c.schoolId), eq(submission.id, row.submissionId)));
    if (!s || !(await loadAssignment(tx, c, s.a))) return null;
    return row;
  });
  if (!f) return null;
  return { bytes: await storage().get(f.key), contentType: f.contentType };
}

/** For the marking worker: the photos of a submission, in page order. */
export async function photosForMarking(tx: Tx, schoolId: string, submissionId: string): Promise<{ id: string; contentType: ImageType; bytes: Buffer }[]> {
  const rows = await tx
    .select({ id: submissionFile.id, key: submissionFile.storageKey, contentType: submissionFile.contentType })
    .from(submissionFile)
    .where(and(eq(submissionFile.schoolId, schoolId), eq(submissionFile.submissionId, submissionId)))
    .orderBy(asc(submissionFile.position));
  return Promise.all(rows.map(async (r) => ({ id: r.id, contentType: r.contentType, bytes: await storage().get(r.key) })));
}
