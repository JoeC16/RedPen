import { Blank, FactText } from "@/components/trust";
import type { DocCtx } from "./context";

export function Accessibility({ o }: DocCtx) {
  return (
    <>
      <p>
        <FactText f={o.company} /> wants as many people as possible to be able to use {o.product}. We aim to meet the Web Content Accessibility Guidelines
        (WCAG) 2.2 at level AA.
      </p>
      <h2>What we have built in</h2>
      <ul>
        <li>Pages use standard links, buttons and form fields, so they can be used with a keyboard, and each starts with a &quot;Skip to main content&quot; link.</li>
        <li>A clearly visible focus outline on every link, button and field.</li>
        <li>Form fields have labels, and errors are announced to screen readers.</li>
        <li>Status (for example approved, flagged or failed) is always written in words, never shown by colour alone.</li>
        <li>Light and dark themes that follow your device setting.</li>
        <li>Feedback sheets print in black on white.</li>
      </ul>
      <h2>How accessible it is today</h2>
      <p>
        This service is <strong>partially compliant</strong>: it has not yet been tested against WCAG 2.2 AA by an independent auditor, so we do not claim full
        compliance. We know of these gaps:
      </p>
      <ul>
        <li>We have not yet run automated accessibility checks on every page, or tested with screen readers (NVDA, JAWS, VoiceOver). Both are planned before the pilot.</li>
        <li>Photos of pupils&apos; handwritten work cannot have a meaningful text alternative. The AI&apos;s typed transcription is shown next to each photo instead.</li>
        <li>Feedback sheets are saved as PDF through the browser&apos;s print dialogue, and those PDFs are not tagged for screen readers.</li>
        <li>The weekly bars on the dashboard are decorative; the numbers beside them carry the information.</li>
      </ul>
      <h2>Feedback and contact</h2>
      <p>
        If you find a problem, or need information in a different format, contact <FactText f={o.supportContact} />. We will reply within{" "}
        <Blank>number</Blank> working days.
      </p>
      <h2>Preparation of this statement</h2>
      <p>
        Prepared on <Blank>date</Blank> from our own testing during development. Next review: <Blank>date, and after the independent audit</Blank>.
      </p>
    </>
  );
}
