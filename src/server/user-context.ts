import { sql } from "drizzle-orm";
import { db } from "./db/client";
import type { UserRole } from "./db/schema";
import type { Ctx } from "./tenancy";

export type SessionUser = Ctx & { email: string; displayName: string };

type Row = {
  id: string;
  email: string;
  display_name: string;
  role: UserRole;
  school_id: string | null;
  authority_id: string;
  disabled_at: Date | null;
};

/** Load the user fresh from the database; disabled or deleted users get no context. */
export async function ctxForUserId(userId: string): Promise<SessionUser | null> {
  const rows = await db().execute<Row>(sql`select * from auth_session_user(${userId}::uuid)`);
  const u = rows[0];
  if (!u || u.disabled_at) return null;
  return {
    userId: u.id,
    email: u.email,
    displayName: u.display_name,
    role: u.role,
    schoolId: u.school_id,
    authorityId: u.authority_id,
  };
}
