import { notFound, withUser, type RouteParams } from "@/server/api";
import { toCsv } from "@/server/csv";
import { exportAssignment } from "@/server/dal/marking";

const fmt = new Intl.DateTimeFormat("en-GB", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/London" });

export const GET = withUser(async (user, _req, { params }: RouteParams<{ assignmentId: string }>) => {
  const data = await exportAssignment(user, (await params).assignmentId);
  if (!data) return notFound();
  const { assignment: a, rows } = data;
  const header = ["Pupil code", "Name", "Status", ...a.criteria.map((c) => `${c.label} (/${c.max})`), `Total (/${a.totalMarks})`, "Feedback", "Approved at", "Approved by"];
  const body = rows.map((r) => [
    r.code,
    r.name,
    r.state,
    ...r.lines,
    r.total,
    r.feedback,
    r.approvedAt ? fmt.format(r.approvedAt) : null,
    r.approvedBy,
  ]);
  const filename = `${a.className}-${a.title}`.replace(/[^A-Za-z0-9_-]+/g, "-").replace(/^-|-$/g, "").slice(0, 80) || "marks";
  return new Response("﻿" + toCsv([header, ...body]), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}.csv"`,
      "Cache-Control": "no-store",
    },
  });
});
