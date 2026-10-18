import { migrate } from "./lib/migrate.ts";

const url = process.env.DATABASE_ADMIN_URL;
if (!url) {
  console.error("DATABASE_ADMIN_URL is not set");
  process.exit(1);
}
await migrate(url);
console.log("migrations up to date");
