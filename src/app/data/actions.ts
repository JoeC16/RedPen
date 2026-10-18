"use server";

import { revalidatePath } from "next/cache";
import { cancelSchoolDeletion, confirmSchoolDeletion, OversightError, requestSchoolDeletion, schoolForDeletion } from "@/server/dal/retention";
import { requirePageUser } from "@/server/session";
import { ForbiddenError } from "@/server/tenancy";

export type FormState = { error?: string; notice?: string };

async function guarded(fn: () => Promise<FormState>): Promise<FormState> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof OversightError) return { error: err.message };
    if (err instanceof ForbiddenError) return { error: "You are not allowed to do that for this school." };
    throw err;
  }
}

/** The admin types the school's name, so nobody deletes the wrong school by a slip. */
async function nameMatches(user: Awaited<ReturnType<typeof requirePageUser>>, schoolId: string, form: FormData) {
  const s = await schoolForDeletion(user, schoolId);
  return Boolean(s) && String(form.get("schoolName") ?? "").trim().toLowerCase() === s!.name.trim().toLowerCase();
}

export async function requestDeletionAction(schoolId: string, _prev: FormState, form: FormData): Promise<FormState> {
  const user = await requirePageUser();
  return guarded(async () => {
    if (!(await nameMatches(user, schoolId, form))) return { error: "Type the school's name exactly to continue." };
    await requestSchoolDeletion(user, schoolId);
    revalidatePath("/data");
    return { notice: "Requested. A different admin must confirm within 24 hours, or the request lapses." };
  });
}

export async function confirmDeletionAction(schoolId: string, requestId: string, _prev: FormState, form: FormData): Promise<FormState> {
  const user = await requirePageUser();
  return guarded(async () => {
    if (!(await nameMatches(user, schoolId, form))) return { error: "Type the school's name exactly to continue." };
    const counts = await confirmSchoolDeletion(user, requestId);
    revalidatePath("/data");
    return {
      notice: `Deleted ${counts.classes ?? 0} classes, ${counts.pupils ?? 0} pupils, ${counts.assignments ?? 0} assignments, ${counts.submissions ?? 0} pieces of work and ${counts.photos ?? 0} photos.`,
    };
  });
}

export async function cancelDeletionAction(requestId: string, _prev: FormState, _form: FormData): Promise<FormState> {
  const user = await requirePageUser();
  return guarded(async () => {
    const ok = await cancelSchoolDeletion(user, requestId);
    revalidatePath("/data");
    return ok ? { notice: "Request cancelled. Nothing was deleted." } : { error: "This request is no longer open." };
  });
}
