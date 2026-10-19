import { Blank, FactText } from "@/components/trust";
import { KeyTable } from "@/components/doc-frame";
import { confirmed } from "@/content/claims-doc";
import type { DocCtx } from "./context";

export function Dpa({ o, authorityName, retentionDays }: DocCtx) {
  return (
    <>
      <p>
        This agreement sets out how <FactText f={o.company} /> (the <strong>processor</strong>) processes personal data for the controller named below when
        providing {o.product}. It is a starting point for negotiation, not a finished contract.
      </p>

      <h2>1. Parties</h2>
      <KeyTable
        caption="Parties"
        rows={[
          ["Controller", <>{authorityName ?? <Blank>school, trust or authority name</Blank>}, <Blank>address</Blank></>],
          ["Processor", <><FactText f={o.company} />, company number <FactText f={o.companyNumber} />, <FactText f={o.address} /></>],
          ["Main agreement", <><Blank>the service agreement this supplements, and its date</Blank></>],
        ]}
      />

      <h2>2. The processing</h2>
      <KeyTable
        caption="Details of processing"
        rows={[
          ["Subject matter and purpose", <>Helping teachers mark homework: proposing marks, evidence and draft feedback for teachers to review and approve; recording approved marks; aggregate reporting.</>],
          ["Duration", <>For the term of the main agreement, then deletion as in clause 3.8.</>],
          ["Data subjects", <>Pupils in classes the controller adds; the controller&apos;s staff who use the service.</>],
          ["Personal data", <>Pupil codes, optional pupil names (encrypted), homework (typed and photographed), marks, feedback; staff names, work emails, roles, sign-in and activity records.</>],
          ["Special category data", <>Not requested. May appear incidentally in homework.</>],
          ["Retention", <>Pupil work is deleted {retentionDays ? `${retentionDays}` : <Blank>number</Blank>} days after approval, as the controller sets. {confirmed("ours.retention")}</>],
        ]}
      />

      <h2>3. Processor obligations</h2>
      <ol>
        <li>Process personal data only on the controller&apos;s documented instructions, which are this agreement and the controller&apos;s use of the service, unless the law requires otherwise (and then tell the controller first, unless the law forbids it).</li>
        <li>Ensure everyone authorised to process the data is bound by confidentiality.</li>
        <li>
          Keep appropriate technical and organisational security measures, including those described in the trust centre and data sheet. {confirmed("ours.tenancy")}
        </li>
        <li>
          Use sub-processors only as listed in the sub-processor list; give the controller <Blank>number</Blank> days&apos; notice of any addition or replacement, with the right to
          object; and impose the same data protection obligations on each.
        </li>
        <li>Help the controller respond to requests from pupils, parents or staff exercising their data protection rights.</li>
        <li>
          Help the controller meet its obligations on security, breach notification, impact assessments and consultation with the regulator. Notify the controller
          of a personal data breach without undue delay and within <Blank>hours</Blank> hours of becoming aware of it.
        </li>
        <li>Not use pupil data for any other purpose, including training AI models. {confirmed("provider.no-training")}</li>
        <li>
          At the end of the service, delete or return all personal data, as the controller chooses, within <Blank>number</Blank> days, unless the law requires it to be kept.
        </li>
        <li>Make available the information needed to show compliance with this agreement, and allow and contribute to audits by the controller or its auditor on <Blank>notice period</Blank> notice.</li>
      </ol>

      <h2>4. International transfers</h2>
      <p>
        {confirmed("provider.region-direct")} {confirmed("provider.uk-transfers")} The processor will move AI marking to an EU route before processing the
        controller&apos;s real pupil data, and will not otherwise transfer personal data outside the UK or EU without the controller&apos;s written agreement.
      </p>

      <h2>5. Liability, law and signatures</h2>
      <KeyTable
        caption="Remaining terms"
        rows={[
          ["Liability", <><Blank>as agreed; cross-refer to the main agreement</Blank></>],
          ["Insurance", <><FactText f={o.cyberInsurance} /></>],
          ["Governing law", <><Blank>Northern Ireland, or England and Wales</Blank></>],
          ["Signed for the controller", <><Blank>name, role, date</Blank></>],
          ["Signed for the processor", <><FactText f={o.dpaSignatory} />, <Blank>date</Blank></>],
        ]}
      />
    </>
  );
}
