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
};
Object.assign(process.env, e2eEnv);

// Runs against a production build (`npm run build` first).
export default defineConfig({
  testDir: "e2e",
  globalSetup: "./e2e/global-setup.ts",
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
    command: `npx next start -p ${PORT}`,
    url: `http://localhost:${PORT}/api/health`,
    reuseExistingServer: !process.env.CI,
    env: e2eEnv,
    timeout: 60_000,
  },
});
