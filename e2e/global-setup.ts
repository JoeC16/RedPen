import { seedFoundation } from "../scripts/lib/fixtures";
import { migrate, resetSchema } from "../scripts/lib/migrate";

export default async function setup() {
  const url = process.env.DATABASE_ADMIN_URL!;
  await resetSchema(url);
  await migrate(url, () => {});
  await seedFoundation(url, process.env.PUPIL_NAME_KEY!);
}
