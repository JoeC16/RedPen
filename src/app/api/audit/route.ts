import { ok, withUser } from "@/server/api";
import { auditFilterSchema, searchAudit } from "@/server/dal/audit-log";

export const GET = withUser(async (user, req) => {
  const params = Object.fromEntries(new URL(req.url).searchParams);
  const filter = auditFilterSchema.safeParse(params);
  if (!filter.success) return Response.json({ error: "Invalid filter" }, { status: 400 });
  return ok({ events: await searchAudit(user, filter.data) });
});
