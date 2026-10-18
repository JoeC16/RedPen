import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { PageTitle } from "@/components/ui";
import { getSettings } from "@/server/dal/retention";
import { requirePageUser } from "@/server/session";
import { MinutesForm, RetentionForm } from "./forms";

export const metadata: Metadata = { title: "Settings" };
export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const user = await requirePageUser();
  if (user.role !== "authority_admin") notFound();
  const s = await getSettings(user);
  if (!s) notFound();
  return (
    <AppShell user={user}>
      <PageTitle description="These apply to every school in your authority. Changes are recorded in the audit log.">Settings</PageTitle>
      <section aria-labelledby="retention-h" className="mb-10 max-w-3xl">
        <h2 id="retention-h" className="mb-2 text-lg font-medium">Retention</h2>
        <p className="mb-4 text-sm text-gray-700 dark:text-gray-300">
          When the period ends, the pupil&apos;s typed work, photos, the AI&apos;s transcription, evidence quotes, comments and feedback are deleted.
          The marks, dates and AI-versus-teacher figures are kept, linked only to the pupil code, for the markbook and the dashboards.
          A scheduled job runs every hour and records each deletion in the audit log.
        </p>
        <RetentionForm days={s.retentionDays} />
      </section>
      <section aria-labelledby="minutes-h" className="max-w-3xl">
        <h2 id="minutes-h" className="mb-2 text-lg font-medium">Time saved assumption</h2>
        <p className="mb-4 text-sm text-gray-700 dark:text-gray-300">
          The dashboard estimates teacher time saved as these minutes for each AI-marked script a teacher approves.
        </p>
        <MinutesForm minutes={s.minutes} />
      </section>
    </AppShell>
  );
}
