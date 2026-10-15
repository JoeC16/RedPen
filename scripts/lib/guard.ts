/** Seeding and resetting are for development, tests and demo environments only. */
export function assertNonProduction(what: string): void {
  if (process.env.NODE_ENV === "production" && process.env.ALLOW_DEMO_SEED !== "true") {
    console.error(`Refusing to ${what} with NODE_ENV=production. Set ALLOW_DEMO_SEED=true for a demo deployment.`);
    process.exit(1);
  }
}

export function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) {
    console.error(`${name} is not set (see .env.example)`);
    process.exit(1);
  }
  return v;
}
