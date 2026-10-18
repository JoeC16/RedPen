// Resets the e2e database. Runs as part of the web server command, so it
// always finishes before the app (and its queue worker) connects.
import { seedFoundation } from "../scripts/lib/fixtures";
import { migrate, resetSchema } from "../scripts/lib/migrate";

const url = process.env.DATABASE_ADMIN_URL!;
await resetSchema(url, process.env.DATABASE_URL);
await migrate(url, () => {});
await seedFoundation(url, process.env.PUPIL_NAME_KEY!);
console.log("e2e database reset");
