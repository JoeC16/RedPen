import path from "node:path";
import { defineConfig } from "vitest/config";

// Integration tests run against a real Postgres (redpen_test), reset before each run.
const testDb = {
  DATABASE_URL: process.env.TEST_DATABASE_URL ?? "postgres://redpen_app:redpen_app_dev@localhost:5432/redpen_test",
  DATABASE_ADMIN_URL:
    process.env.TEST_DATABASE_ADMIN_URL ?? "postgres://redpen_owner:redpen_owner_dev@localhost:5432/redpen_test",
};

export default defineConfig({
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "src") } },
  test: {
    include: ["tests/**/*.test.ts"],
    globalSetup: ["tests/global-setup.ts"],
    fileParallelism: false,
    testTimeout: 20_000,
    env: {
      ...testDb,
      PUPIL_NAME_KEY: "dGVzdC1vbmx5LXB1cGlsLW5hbWUta2V5LTMyLWJ5dGU=",
      AUTH_SECRET: "test-only-secret-test-only-secret-test-only",
      LOGIN_MAX_FAILURES_PER_EMAIL: "5",
      LOGIN_MAX_FAILURES_PER_IP: "30",
      LOGIN_WINDOW_MINUTES: "15",
    },
  },
});
