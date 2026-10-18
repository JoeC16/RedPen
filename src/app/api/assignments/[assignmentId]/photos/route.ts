import { notFound, ok, withUser, type RouteParams } from "@/server/api";
import { MarkingError } from "@/server/dal/marking";
import { addPhoto } from "@/server/dal/photos";
import { MAX_PHOTO_BYTES } from "@/server/uploads/image";

/**
 * Upload one photographed page (multipart: file, optional pupilId, namesConfirmed).
 * One request per photo keeps each request small and lets the page show which
 * files succeeded. Without pupilId the pupil is matched from the file name.
 */
export const POST = withUser(async (user, req, { params }: RouteParams<{ assignmentId: string }>) => {
  const { assignmentId } = await params;
  const length = Number(req.headers.get("content-length") ?? 0);
  if (length > MAX_PHOTO_BYTES + 64 * 1024) return Response.json({ error: "Each photo must be 5 MB or smaller." }, { status: 413 });
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return Response.json({ error: "Upload a photo." }, { status: 400 });
  }
  const file = form.get("file");
  if (!(file instanceof File)) return Response.json({ error: "Upload a photo." }, { status: 400 });
  if (file.size > MAX_PHOTO_BYTES) return Response.json({ error: `${file.name}: each photo must be 5 MB or smaller.` }, { status: 413 });
  const pupilId = form.get("pupilId");
  try {
    const result = await addPhoto(user, assignmentId, {
      pupilId: typeof pupilId === "string" && pupilId ? pupilId : undefined,
      fileName: file.name || "photo",
      bytes: Buffer.from(await file.arrayBuffer()),
      namesConfirmed: form.get("namesConfirmed") === "yes",
    });
    return ok(result);
  } catch (err) {
    if (err instanceof MarkingError) {
      return err.message === "Assignment not found." || err.message === "Pupil not found."
        ? notFound()
        : Response.json({ error: err.message }, { status: 400 });
    }
    throw err;
  }
});
