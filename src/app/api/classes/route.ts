import { ok, withUser } from "@/server/api";
import { listClasses } from "@/server/dal/classes";

export const GET = withUser(async (user) => ok({ classes: await listClasses(user) }));
