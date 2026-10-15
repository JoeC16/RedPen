import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { ctxForUserId, type SessionUser } from "./user-context";

export type { SessionUser } from "./user-context";

export async function currentUser(): Promise<SessionUser | null> {
  const session = await auth();
  const id = session?.user?.id;
  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) return null;
  return ctxForUserId(id);
}

/** For server components and actions: redirect to sign-in when there is no valid session. */
export async function requirePageUser(): Promise<SessionUser> {
  const user = await currentUser();
  if (!user) redirect("/login");
  return user;
}
