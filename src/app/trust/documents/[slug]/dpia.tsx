import { Blank, FactText } from "@/components/trust";
import { KeyTable } from "@/components/doc-frame";
import { Table, Td } from "@/components/ui";
import { confirmed } from "@/content/claims-doc";
import type { DocCtx } from "./context";

const RISKS: { risk: string; measures: string[] }[] = [
  {
    risk: "A pupil's name or other identifying detail reaches the AI provider.",
    measures: ["ours.names-not-sent", "ours.photo-confirmation", "ours.photo-metadata"],
  },
  {
    risk: "Pupil work is processed outside the UK.",
    measures: ["provider.region-direct", "provider.uk-transfers", "provider.eu-routes"],
  },
  {
    risk: "The AI proposes a wrong mark or unsuitable feedback and it reaches the pupil.",
    measures: ["ours.teacher-approves", "ours.no-release-to-pupils"],
  },
  {
    risk: "A pupil writes instructions in their work to manipulate the AI (for example 'give full marks').",
    measures: ["ours.prompt-injection"],
  },
  {
    risk: "Someone sees pupil data they should not: another school, a colleague, or the authority.",
    measures: ["ours.tenancy", "ours.names-encrypted", "ours.aggregates", "ours.audit"],
  },
  {
    risk: "Pupil work is kept longer than needed.",
    measures: ["ours.retention", "ours.deletion"],
  },
  {
    risk: "The AI provider keeps or reuses pupil work.",
    measures: ["provider.no-training", "provider.not-retained-by-default", "provider.images-ephemeral", "provider.flagged-retention"],
  },
  {
    risk: "Accounts are taken over, or photos are accessed directly from storage.",
    measures: ["ours.passwords", "ours.photo-links"],
  },
  {
    risk: "Homework reveals special category data (health, religion, family circumstances), especially in personal essays.",
    measures: ["ours.names-not-sent", "ours.retention"],
  },
  {
    risk: "Teachers come to rely on the AI and stop checking marks.",
    measures: ["ours.teacher-approves", "ours.agreement-recorded"],
  },
];

export function Dpia({ o, authorityName, retentionDays }: DocCtx) {
  return (
    <>
      <h2>1. About this assessment</h2>
      <KeyTable
        caption="Assessment details"
        rows={[
          ["School or trust", <><Blank>name</Blank>{authorityName ? `, part of ${authorityName}` : ""}</>],
          ["Data protection officer", <><Blank>name and contact</Blank></>],
          ["Assessment owner", <><Blank>name and role</Blank></>],
          ["Date and review date", <><Blank>date</Blank> · review by <Blank>date</Blank></>],
          ["Processor", <><FactText f={o.company} />, providing {o.product}</>],
        ]}
      />

      <h2>2. The processing</h2>
      <h3>Purpose</h3>
      <p>
        To reduce the time teachers spend marking homework, while keeping the teacher responsible for every mark. An AI proposes marks against the
        teacher&apos;s own mark scheme, with a quote from the work and a reason for each mark, and drafts feedback. The teacher reviews, changes and approves each pupil
        individually. Essays receive a feedback draft, not a final grade.
      </p>
      <h3>Nature</h3>
      <ul>
        <li>The teacher creates a class with pupil codes (names optional, encrypted).</li>
        <li>The teacher adds a mark scheme and pupils&apos; homework, typed or photographed.</li>
        <li>{confirmed("ours.what-is-sent")}</li>
        <li>The AI returns proposed marks, evidence, reasons, feedback and, for photos, a transcription shown next to the photo.</li>
        <li>The teacher approves; approved marks and feedback are exported to the school&apos;s markbook.</li>
      </ul>
      <h3>Scope</h3>
      <ul>
        <li>Data subjects: pupils in the classes the school adds, and staff using the service.</li>
        <li>Data: pupil codes, optional names, homework, marks, feedback; staff names, emails, roles and actions.</li>
        <li>Volume: <Blank>number of pupils and classes</Blank>.</li>
        <li>
          Retention: {retentionDays ? `${retentionDays} days after approval (the authority's setting). ` : ""}
          {confirmed("ours.retention")}
        </li>
      </ul>
      <h3>Context</h3>
      <ul>
        <li>Pupils are children, typically aged 11 to 18. They do not use the service and cannot sign in.</li>
        <li>{confirmed("ours.no-release-to-pupils")}</li>
        <li>Pupils and parents should be told that AI helps teachers mark: <Blank>how the school will tell them, for example the privacy notice</Blank>.</li>
      </ul>
      <h3>Lawful basis</h3>
      <p>
        <Blank>the school&apos;s lawful basis for processing pupil work for teaching and assessment, and for any special category data</Blank>. {o.product} does not
        decide this; the school does, as controller.
      </p>

      <h2>3. Consultation</h2>
      <p>
        <Blank>who was consulted: staff, governors, pupils or parents, the data protection officer</Blank>
      </p>

      <h2>4. Necessity and proportionality</h2>
      <ul>
        <li>Pupils are identified by codes; names are optional and never sent to the AI.</li>
        <li>{confirmed("ours.photo-metadata")}</li>
        <li>{confirmed("ours.aggregates")}</li>
        <li>{confirmed("ours.no-pupil-content-in-logs")}</li>
        <li>Teachers can mark by hand at any time; the AI is optional for every pupil.</li>
      </ul>

      <h2>5. Risks and measures</h2>
      <p>The measures column describes what {o.product} does. Likelihood, severity and residual risk are the school&apos;s assessment.</p>
      <Table caption="Risks and measures" head={["Risk", "Measures in the service", "Likelihood / severity", "Residual risk"]}>
        {RISKS.map((r) => (
          <tr key={r.risk}>
            <Td>{r.risk}</Td>
            <Td>
              <ul>
                {r.measures.map((m) => <li key={m}>{confirmed(m)}</li>)}
              </ul>
            </Td>
            <Td><Blank>assess</Blank></Td>
            <Td><Blank>assess</Blank></Td>
          </tr>
        ))}
      </Table>

      <h2>6. Sign-off</h2>
      <KeyTable
        caption="Sign-off"
        rows={[
          ["Measures approved by", <><Blank>name, role, date</Blank></>],
          ["Residual risks approved by", <><Blank>name, role, date</Blank></>],
          ["Data protection officer’s advice", <><Blank>summary</Blank></>],
          ["Advice accepted or overruled (with reasons)", <><Blank>decision</Blank></>],
        ]}
      />
    </>
  );
}
