"use server";

import { revalidatePath } from "next/cache";
import { minutesSchema, retentionSchema, setRetention, setTimeSavedMinutes } from "@/server/dal/retention";
import { requirePageUser } from "@/server/session";

export type FormState = { error?: string; notice?: string };

export async function setRetentionAction(_prev: FormState, form: FormData): Promise<FormState> {
  const user = await requirePageUser();
  const parsed = retentionSchema.safeParse(form.get("days"));
  if (!parsed.success) return { error: parsed.error.issues[0]!.message };
  const moved = await setRetention(user, parsed.data);
  revalidatePath("/settings");
  return {
    notice: `Saved: work is deleted ${parsed.data} ${parsed.data === 1 ? "day" : "days"} after approval. ${moved} approved ${moved === 1 ? "script was" : "scripts were"} rescheduled.`,
  };
}

export async function setMinutesAction(_prev: FormState, form: FormData): Promise<FormState> {
  const user = await requirePageUser();
  const parsed = minutesSchema.safeParse({ short: form.get("short"), maths: form.get("maths"), essay: form.get("essay") });
  if (!parsed.success) return { error: "Enter minutes between 0 and 120 for each work type." };
  await setTimeSavedMinutes(user, parsed.data);
  revalidatePath("/settings");
  revalidatePath("/dashboard");
  return { notice: "Saved. The dashboard uses these minutes from now on." };
}
