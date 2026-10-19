import { defineConfig, devices } from "@playwright/test";

// The demo script (docs/demo-script.md), rehearsed against the full demo
// dataset in its own database, so the main e2e suite keeps its small fixture.
const PORT = Number(process.env.E2E_DEMO_PORT ?? 3101);
const env = {
  DATABASE_URL: process.env.E2E_DEMO_DATABASE_URL ?? "postgres://redpen_app:redpen_app_dev@localhost:5432/redpen_e2e_demo",
  DATABASE_ADMIN_URL: process.env.E2E_DEMO_DATABASE_ADMIN_URL ?? "postgres://redpen_owner:redpen_owner_dev@localhost:5432/redpen_e2e_demo",
  PUPIL_NAME_KEY: "ZTJlLW9ubHktcHVwaWwtbmFtZS1rZXktMzItYnl0ZXM=",
  AUTH_SECRET: "e2e-only-secret-e2e-only-secret-e2e-only-secret",
  AUTH_TRUST_HOST: "true",
  AUTH_URL: `http://localhost:${PORT}`,
  ANTHROPIC_API_KEY: "",
  MARKING_MODE: "demo",
  DEMO_DATASET: "1",
};
Object.assign(process.env, env);

export default defineConfig({
  testDir: "e2e-demo",
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never", outputFolder: "playwright-report-demo" }]] : "list",
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
    launchOptions: process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {},
  },
  projects: [{ name: "demo", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `npx tsx e2e/reset-db.ts && npx next start -p ${PORT}`,
    url: `http://localhost:${PORT}/api/health`,
    reuseExistingServer: false,
    env,
    timeout: 120_000,
  },
});
