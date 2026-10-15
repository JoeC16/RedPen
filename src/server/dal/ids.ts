const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Malformed ids are treated as "not found", never passed to Postgres. */
export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID.test(value);
}
