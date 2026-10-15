import { seedFoundation } from "../scripts/lib/fixtures";
import { migrate, resetSchema } from "../scripts/lib/migrate";

export default async function setup() {
  const url = process.env.TEST_DATABASE_ADMIN_URL ?? "postgres://redpen_owner:redpen_owner_dev@localhost:5432/redpen_test";
  await resetSchema(url);
  await migrate(url, () => {});
  await seedFoundation(url, "dGVzdC1vbmx5LXB1cGlsLW5hbWUta2V5LTMyLWJ5dGU=");
}
