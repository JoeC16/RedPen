import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.E2E_PORT ?? 3100);
const e2eEnv = {
  DATABASE_URL: process.env.E2E_DATABASE_URL ?? "postgres://redpen_app:redpen_app_dev@localhost:5432/redpen_e2e",
  DATABASE_ADMIN_URL:
    process.env.E2E_DATABASE_ADMIN_URL ?? "postgres://redpen_owner:redpen_owner_dev@localhost:5432/redpen_e2e",
  PUPIL_NAME_KEY: "ZTJlLW9ubHktcHVwaWwtbmFtZS1rZXktMzItYnl0ZXM=",
  AUTH_SECRET: "e2e-only-secret-e2e-only-secret-e2e-only-secret",
  AUTH_TRUST_HOST: "true",
  AUTH_URL: `http://localhost:${PORT}`,
  ANTHROPIC_API_KEY: "",
  MARKING_MODE: "demo",
};
Object.assign(process.env, e2eEnv);

// Runs against a production build (`npm run build` first). Demo marking mode:
// no API key is passed, so the DemoProvider answers.
export default defineConfig({
  testDir: "e2e",
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
    launchOptions: process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {},
  },
  projects: [
    { name: "chromium-light", use: { ...devices["Desktop Chrome"], colorScheme: "light" } },
    { name: "chromium-dark", use: { ...devices["Desktop Chrome"], colorScheme: "dark" }, testMatch: /smoke/ },
  ],
  webServer: {
    // Reset the database first, then start the app, so the worker never sees a half-reset schema.
    command: `npx tsx e2e/reset-db.ts && npx next start -p ${PORT}`,
    url: `http://localhost:${PORT}/api/health`,
    // Never reuse: an old server against a fresh build serves stale assets.
    reuseExistingServer: false,
    env: e2eEnv,
    timeout: 60_000,
  },
});
