import { notFound, ok, withUser, type RouteParams } from "@/server/api";
import { getClass, listClassTeachers } from "@/server/dal/classes";

export const GET = withUser(async (user, _req, { params }: RouteParams<{ classId: string }>) => {
  const { classId } = await params;
  const cls = await getClass(user, classId);
  if (!cls) return notFound();
  return ok({ class: cls, teachers: await listClassTeachers(user, classId) });
});
