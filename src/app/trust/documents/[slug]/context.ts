import type { Org } from "@/content/org";

/** What a document is filled in with. Authority details only when a signed-in user belongs to one. */
export type DocCtx = { o: Org; authorityName: string | null; retentionDays: number | null; demo: boolean };
