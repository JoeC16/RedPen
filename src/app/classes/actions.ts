"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { classInputSchema, createClass, importPupils, setClassTeacher } from "@/server/dal/classes";
import { parsePupilCsv } from "@/server/csv";
import { requirePageUser } from "@/server/session";

export type FormState = { error?: string; errors?: string[]; notice?: string };

export async function createClassAction(_prev: FormState, form: FormData): Promise<FormState> {
  const user = await requirePageUser();
  const parsed = classInputSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues.map((i) => i.message).join(" ") };
  const id = await createClass(user, parsed.data);
  redirect(`/classes/${id}`);
}

const MAX_CSV_BYTES = 200_000;

export async function importPupilsAction(classId: string, _prev: FormState, form: FormData): Promise<FormState> {
  const user = await requirePageUser();
  let text = String(form.get("csv") ?? "");
  const file = form.get("file");
  if (file instanceof File && file.size > 0) {
    if (file.size > MAX_CSV_BYTES) return { error: "That file is too large. Class lists should be under 200 KB." };
    if (!/\.(csv|txt)$/i.test(file.name) && !/^text\/(csv|plain)/.test(file.type)) {
      return { error: "Upload a .csv file." };
    }
    text = await file.text();
  }
  if (!text.trim()) return { error: "Paste the class list or choose a CSV file." };
  const parsed = parsePupilCsv(text);
  if (parsed.errors.length) {
    return { error: "Nothing was imported. Fix these rows and try again:", errors: parsed.errors.map((e) => `Row ${e.line}: ${e.message}`) };
  }
  const result = await importPupils(user, classId, parsed.rows);
  if (!result) return { error: "Class not found." };
  if (result.errors.length) return { error: "Nothing was imported:", errors: result.errors.map((e) => e.message) };
  revalidatePath(`/classes/${classId}`);
  redirect(`/classes/${classId}?imported=${result.added}`);
}

export async function setClassTeacherAction(classId: string, form: FormData): Promise<void> {
  const user = await requirePageUser();
  await setClassTeacher(user, classId, String(form.get("userId") ?? ""), form.get("assign") === "1");
  revalidatePath(`/classes/${classId}`);
}
