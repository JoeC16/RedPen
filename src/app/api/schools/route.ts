import { ok, withUser } from "@/server/api";
import { listSchools } from "@/server/dal/schools";

export const GET = withUser(async (user) => ok({ schools: await listSchools(user) }));
