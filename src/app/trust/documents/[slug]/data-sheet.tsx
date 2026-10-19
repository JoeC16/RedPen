import { Blank, FactText } from "@/components/trust";
import { confirmed } from "@/content/claims-doc";
import type { DocCtx } from "./context";

export function DataSheet({ o, authorityName, retentionDays }: DocCtx) {
  return (
    <>
      <p>
        {o.product} helps secondary school teachers mark homework. A teacher uploads a mark scheme and pupils&apos; work; an AI proposes marks, evidence and
        draft feedback; the teacher checks, changes and approves every mark. Provided by <FactText f={o.company} />.
      </p>
      <h2>Roles</h2>
      <ul>
        <li>Controller: the school, or {authorityName ?? <Blank>authority or trust name</Blank>} where it decides how pupil data is used.</li>
        <li>Processor: <FactText f={o.company} /> (ICO registration <FactText f={o.icoRegistration} />).</li>
        <li>Sub-processors: listed in the sub-processor list, with what each processes and where.</li>
      </ul>
      <h2>Personal data processed</h2>
      <ul>
        <li>Pupils: a pseudonymous code chosen by the school; optionally a name, encrypted and shown only to the class&apos;s teachers; their homework (typed or photographed); marks and feedback.</li>
        <li>Staff: name, work email, role, school, sign-in records and an audit trail of actions.</li>
        <li>No special category data is requested. Homework could reveal it incidentally (for example a personal essay).</li>
      </ul>
      <h2>What goes to the AI</h2>
      <p>{confirmed("ours.what-is-sent")}</p>
      <p>{confirmed("ours.names-not-sent")}</p>
      <p>{confirmed("ours.photo-confirmation")}</p>
      <h2>Where</h2>
      <ul>
        <li>Database: <FactText f={o.hostingProvider} />, <FactText f={o.hostingRegion} />.</li>
        <li>Photos: <FactText f={o.storageProvider} />, <FactText f={o.storageRegion} />, private and encrypted at rest.</li>
        <li>AI marking: Anthropic. {confirmed("provider.region-direct")} We will move to an EU route before real pupil data is processed.</li>
      </ul>
      <h2>Retention</h2>
      <p>
        {retentionDays ? `Your authority's setting: ${retentionDays} days after approval. ` : ""}
        {confirmed("ours.retention")}
      </p>
      <h2>The AI provider</h2>
      <ul>
        <li>{confirmed("provider.no-training")}</li>
        <li>{confirmed("provider.not-retained-by-default")}</li>
        <li>{confirmed("provider.flagged-retention")}</li>
        <li>{confirmed("provider.uk-transfers")}</li>
      </ul>
      <h2>Safeguards</h2>
      <ul>
        <li>{confirmed("ours.teacher-approves")}</li>
        <li>{confirmed("ours.tenancy")}</li>
        <li>{confirmed("ours.audit")}</li>
        <li>{confirmed("ours.passwords")}</li>
      </ul>
      <h2>Contact</h2>
      <p>
        <FactText f={o.privacyContact} />
      </p>
    </>
  );
}
