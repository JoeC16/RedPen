import { notFound, withUser, type RouteParams } from "@/server/api";
import { readPhoto } from "@/server/dal/photos";
import { verifyFileUrl } from "@/server/storage/signed-url";

/**
 * Serve a pupil photo. Needs all three: a signed link issued to this user that
 * has not expired, a valid session, and permission to see that pupil's work.
 */
export const GET = withUser(async (user, req, { params }: RouteParams<{ fileId: string }>) => {
  const { fileId } = await params;
  const url = new URL(req.url);
  if (!verifyFileUrl(fileId, user.userId, url.searchParams.get("e"), url.searchParams.get("s"))) {
    return Response.json({ error: "This link has expired. Reload the page." }, { status: 403, headers: { "Cache-Control": "no-store" } });
  }
  const photo = await readPhoto(user, fileId);
  if (!photo) return notFound();
  return new Response(new Uint8Array(photo.bytes), {
    headers: {
      "Content-Type": photo.contentType,
      "Content-Length": String(photo.bytes.length),
      "Cache-Control": "private, no-store",
      "Content-Disposition": "inline",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
    },
  });
});
