import type { Metadata } from "next";
import Link from "next/link";
import { ClaimList, FactText, Section, TrustShell } from "@/components/trust";
import { linkClass, PageTitle, Table, Td } from "@/components/ui";
import { confirmed } from "@/content/claims-doc";
import { org } from "@/content/org";
import { getAuthority } from "@/server/dal/schools";
import { markingMode } from "@/server/marking/config";
import { currentUser } from "@/server/session";
import { DOCUMENTS } from "./doc-list";

export const metadata: Metadata = { title: "Trust centre" };
export const dynamic = "force-dynamic";

export default async function TrustPage() {
  const user = await currentUser();
  const authority = user ? await getAuthority(user) : null;
  const o = org();
  const days = authority?.retentionDays;
  const demo = markingMode() === "demo";
  const backupDays = Number(process.env.BACKUP_RETENTION_DAYS) || null;

  return (
    <TrustShell user={user}>
      <PageTitle description="What happens to pupil data in this service, who can see it, and where it goes. Every statement here is checked against our code or a primary source.">
        Trust centre
      </PageTitle>

      <Section id="short" title="The short version">
        <ul className="list-disc space-y-2 pl-5">
          <li>{confirmed("ours.teacher-approves")}</li>
          <li>{confirmed("ours.names-not-sent")}</li>
          <li>{confirmed("ours.tenancy")}</li>
          <li>{confirmed("ours.retention")}</li>
        </ul>
      </Section>

      <Section id="ai" title="What goes to the AI, and what does not">
        <p>{confirmed("ours.what-is-sent")}</p>
        <Table caption="Data sent to the AI provider" head={["Sent for marking", "Never sent"]}>
          <tr>
            <Td>
              <ul className="list-disc pl-5">
                <li>The mark scheme and total marks</li>
                <li>The work type (short answers, maths, essay)</li>
                <li>The pupil&apos;s typed work, with names removed</li>
                <li>Photos of the work, with location data removed, after the teacher confirms names are cropped out</li>
              </ul>
            </Td>
            <Td>
              <ul className="list-disc pl-5">
                <li>Pupil names or pupil codes</li>
                <li>Teacher, school or authority names</li>
                <li>Marks the teacher has given, or earlier feedback</li>
                <li>Anything about other pupils</li>
              </ul>
            </Td>
          </tr>
        </Table>
        <p>{confirmed("ours.photo-confirmation")}</p>
        <p>{confirmed("ours.photo-metadata")}</p>
        <p className="text-sm text-gray-700 dark:text-gray-300">
          The AI proposes marks, a quote from the work as evidence for each mark, a reason, and draft feedback. A teacher checks and approves every one.
          Essays get a feedback draft, not a final grade.
        </p>
      </Section>

      <Section id="who" title="Who can see what">
        <Table caption="Access by role" head={["Role", "Can see", "Cannot see"]}>
          <tr>
            <Td>Teacher</Td>
            <Td>Their own classes: pupil codes and names, work, photos, marks and feedback.</Td>
            <Td>Colleagues&apos; classes, unless a school admin shares them. Other schools.</Td>
          </tr>
          <tr>
            <Td>School admin</Td>
            <Td>Every class in their school with pupil codes; work and marks, read-only (each view is logged); the school dashboard and audit log.</Td>
            <Td>Pupil names. Other schools.</Td>
          </tr>
          <tr>
            <Td>Authority admin</Td>
            <Td>Aggregate dashboards for their schools, the audit log, retention settings.</Td>
            <Td>Any pupil&apos;s work, marks, feedback or name.</Td>
          </tr>
          <tr>
            <Td>Pupils and parents</Td>
            <Td>Nothing. They have no access to the service.</Td>
            <Td>Feedback reaches them only when a teacher shares it.</Td>
          </tr>
        </Table>
        <p>{confirmed("ours.aggregates")}</p>
        <p>{confirmed("ours.names-encrypted")}</p>
      </Section>

      <Section id="retention" title="How long we keep it">
        <p>
          {days
            ? `Your authority deletes pupil work ${days} days after a teacher approves it.`
            : "Pupil work is deleted 30 days after a teacher approves it, unless the authority sets a different period."}{" "}
          The deletion covers the typed work, photos, the AI&apos;s transcription, evidence quotes, comments and feedback. A job runs every hour and records each deletion in the audit log.
        </p>
        <p>The marks, dates and the difference between the AI&apos;s mark and the teacher&apos;s are kept, linked only to the pupil code, for the school&apos;s markbook and for the quality figures.</p>
        <p>{confirmed("ours.deletion")}</p>
        {backupDays ? (
          <p>
            Backups (daily snapshots of the database and photo storage) are kept for {backupDays} days, so deleted work can remain in a backup for up to{" "}
            {backupDays} days after it is deleted.
          </p>
        ) : null}
      </Section>

      <Section id="where" title="Where data is stored">
        <p>
          The database runs with <FactText f={o.hostingProvider} /> in <FactText f={o.hostingRegion} />. Photos are kept in private object storage with{" "}
          <FactText f={o.storageProvider} /> in <FactText f={o.storageRegion} />.
        </p>
        <ClaimList topic="hosting" />
        <p>
          Pupil work sent for marking is processed by the AI provider, Anthropic, through its own API. {confirmed("provider.region-direct")} Before any school
          uses {o.product} with real pupils, we will move marking to an EU route (Claude on Amazon Bedrock) and update this page.
        </p>
        {demo ? (
          <p className="rounded border border-amber-600 p-3">
            <strong>This installation is in demo mode:</strong> no work is sent to the AI at all. Marking uses built-in example results for invented pupils.
          </p>
        ) : null}
      </Section>

      <Section id="provider" title="The AI provider">
        <ClaimList topic="provider" />
      </Section>

      <Section id="subprocessors" title="Sub-processors">
        <p>
          The full list, with what each one processes and where, is in the <Link href="/trust/documents/subprocessors" className={linkClass}>sub-processor list</Link>.
        </p>
      </Section>

      <Section id="security" title="Security">
        <ul className="list-disc space-y-2 pl-5">
          <li>{confirmed("ours.passwords")}</li>
          <li>{confirmed("ours.photo-links")}</li>
          <li>{confirmed("ours.audit")}</li>
          <li>{confirmed("ours.no-pupil-content-in-logs")}</li>
          <li>The app tells browsers to use HTTPS only, and sets strict security headers. Secrets are read from the environment, never stored in code.</li>
        </ul>
      </Section>

      <Section id="guidance" title="Guidance we follow">
        <ClaimList topic="guidance" />
      </Section>

      <Section id="documents" title="Documents">
        <p>For data protection officers and procurement. Each opens as a page you can print or save as PDF; templates have blanks for your details.</p>
        <ul className="list-disc space-y-1 pl-5">
          {DOCUMENTS.map((d) => (
            <li key={d.slug}>
              <Link href={`/trust/documents/${d.slug}`} className={linkClass}>
                {d.title}
              </Link>
              <span className="text-sm text-gray-700 dark:text-gray-300"> · {d.summary}</span>
            </li>
          ))}
        </ul>
      </Section>

      <Section id="contact" title="Contact">
        <p>
          Questions about data protection: <FactText f={o.privacyContact} />. Data controller for pupil data: the school (or the authority, where it decides
          how pupil data is used). {o.product} is provided by <FactText f={o.company} /> as a data processor.
        </p>
      </Section>
    </TrustShell>
  );
}
