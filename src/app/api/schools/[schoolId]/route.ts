import { notFound, ok, withUser, type RouteParams } from "@/server/api";
import { getSchool } from "@/server/dal/schools";

export const GET = withUser(async (user, _req, { params }: RouteParams<{ schoolId: string }>) => {
  const school = await getSchool(user, (await params).schoolId);
  return school ? ok({ school }) : notFound();
});
