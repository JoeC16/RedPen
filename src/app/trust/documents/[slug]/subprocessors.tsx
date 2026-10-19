import { FactText } from "@/components/trust";
import { Table, Td } from "@/components/ui";
import { confirmed } from "@/content/claims-doc";
import type { DocCtx } from "./context";

export function SubProcessors({ o, demo }: DocCtx) {
  return (
    <>
      <p>
        Companies that process personal data on behalf of <FactText f={o.company} /> to provide {o.product}. We will tell controllers before adding or
        replacing one, as the data processing agreement sets out.
      </p>
      <Table caption="Sub-processors" head={["Company", "What for", "Data", "Where"]}>
        <tr>
          <Td>Anthropic PBC</Td>
          <Td>AI marking: proposed marks, evidence, transcription of photos, draft feedback</Td>
          <Td>Mark schemes; pupil work with names removed; photos of work</Td>
          <Td>{confirmed("provider.region-direct")}</Td>
        </tr>
        <tr>
          <Td><FactText f={o.hostingProvider} /></Td>
          <Td>Hosting the application and database</Td>
          <Td>All service data</Td>
          <Td><FactText f={o.hostingRegion} /></Td>
        </tr>
        <tr>
          <Td><FactText f={o.storageProvider} /></Td>
          <Td>Storing photos of pupil work</Td>
          <Td>Photos (metadata removed)</Td>
          <Td><FactText f={o.storageRegion} /></Td>
        </tr>
      </Table>
      <h2>Planned change</h2>
      <p>
        Before real pupil data is processed, AI marking moves to Claude on Amazon Bedrock with EU routing. Amazon Web Services will then replace Anthropic
        as the AI sub-processor for marking. {confirmed("provider.eu-routes")}
      </p>
      {demo ? <p>This installation runs in demo mode: no data is sent to the AI provider.</p> : null}
      <h2>Not used</h2>
      <p>No analytics, advertising or tracking services. No email service yet (the service sends no email).</p>
      <h2>Anthropic&apos;s own sub-processors</h2>
      <p>Anthropic publishes its own list at https://www.anthropic.com/subprocessors. We have not yet been able to check it, so we do not repeat it here.</p>
    </>
  );
}
