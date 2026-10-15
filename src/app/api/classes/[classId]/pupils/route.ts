import { notFound, ok, withUser, type RouteParams } from "@/server/api";
import { listPupils } from "@/server/dal/classes";

export const GET = withUser(async (user, _req, { params }: RouteParams<{ classId: string }>) => {
  const pupils = await listPupils(user, (await params).classId);
  return pupils ? ok({ pupils }) : notFound();
});
