import { ok, withUser } from "@/server/api";

export const GET = withUser(async (user) =>
  ok({ id: user.userId, email: user.email, displayName: user.displayName, role: user.role, schoolId: user.schoolId }),
);
