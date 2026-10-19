# Claims register

<!-- Generated from src/content/claims.ts by `npm run docs:claims`. Do not edit by hand. -->

Every statement Red Pen makes about how data is handled, with its evidence. Statements about our own system point to the code and tests that make them true. Statements about the AI provider and about UK guidance quote the primary source and give the date it was read.

Only **confirmed** claims appear in the app, the trust centre or the generated documents. **NOT CONFIRMED** items must not be used in marketing or sales material until they are checked.

Re-check provider and guidance claims before each sales conversation and at least every six months: terms and guidance change.

## How Red Pen is built

### ours.names-not-sent

**Confirmed.** Pupil and staff names are never sent to the AI. Typed work has every name on the school's pupil and staff lists removed before sending, and the request carries no pupil code, school or teacher identity.

Evidence in this repository:

- `src/server/marking/redact.ts`
- `src/server/marking/prompt.ts`
- `tests/integration/marking-engine.test.ts` (never sends pupil or staff names)

Note: A name the school has not recorded (a sibling, a nickname) could remain in typed work. Teachers are told not to paste names.

### ours.photo-confirmation

**Confirmed.** Names cannot be removed from a photo automatically, so a teacher must confirm names are cropped out or covered before each upload, and the confirmation is recorded.

Evidence in this repository:

- `src/server/dal/photos.ts`
- `tests/integration/photos.test.ts` (refuses without the names-cropped confirmation)

### ours.photo-metadata

**Confirmed.** Location and other metadata (EXIF, XMP, IPTC) are removed from every photo before it is stored or sent to the AI.

Evidence in this repository:

- `src/server/uploads/image.ts`
- `tests/unit/photos.test.ts`
- `e2e/photos.spec.ts`

### ours.what-is-sent

**Confirmed.** For each piece of work the AI receives the mark scheme, the total marks, the work type, the pupil's typed work with names removed, and any photos of the work. Nothing else.

Evidence in this repository:

- `src/server/marking/prompt.ts`
- `src/server/marking/claude.ts`
- `src/server/marking/engine.ts`

### ours.teacher-approves

**Confirmed.** No mark or feedback is final until a teacher approves it, one pupil at a time. There is no 'approve all'. The AI's suggestion and the teacher's final mark are stored separately.

Evidence in this repository:

- `src/server/dal/marking.ts` (approve)
- `db/migrations/0002_teacher_core.sql` (locks)
- `e2e/marking.spec.ts`
- `e2e/ai-marking.spec.ts`

### ours.prompt-injection

**Confirmed.** Pupil work is sent to the AI as delimited data, and the AI is told to ignore and flag any instructions inside it. The app also checks for such instructions itself; that work is marked low confidence and shown to the teacher first.

Evidence in this repository:

- `src/server/marking/prompt.ts`
- `src/server/marking/redact.ts` (detectInjection)
- `tests/unit/marking-engine.test.ts`
- `tests/integration/marking-engine.test.ts` (a hostile script)
- `e2e/ai-marking.spec.ts`

### ours.agreement-recorded

**Confirmed.** Every change a teacher makes to an AI mark is recorded, and school and authority admins see how often teachers keep or change the AI's marks.

Evidence in this repository:

- `src/server/marking/marks.ts` (agreement)
- `src/server/dal/oversight.ts`
- `tests/integration/marking-engine.test.ts` (records the agreement)
- `tests/integration/oversight.test.ts`

### ours.no-release-to-pupils

**Confirmed.** Pupils and parents have no access. Nothing is sent to a pupil automatically; teachers share feedback themselves.

Evidence in this repository:

- `src/server/roles.ts`
- `CLAUDE.md` (non-goals)

### ours.tenancy

**Confirmed.** Teachers see only their own classes; school admins see their own school; authority admins see aggregates only, never pupil work. This is enforced in the application and again in the database with row-level security.

Evidence in this repository:

- `src/server/tenancy.ts`
- `db/migrations/0001_foundation.sql`
- `tests/integration/rls.test.ts`
- `tests/integration/routes.test.ts`
- `e2e/tenancy.spec.ts`

### ours.names-encrypted

**Confirmed.** Pupil names, if a school imports them, are encrypted (AES-256-GCM) by the application and shown only to that class's teachers.

Evidence in this repository:

- `src/server/crypto.ts`
- `tests/unit/crypto.test.ts`
- `tests/integration/rls.test.ts`

### ours.retention

**Confirmed.** Pupil work, photos, the AI's transcription, evidence quotes, comments and feedback are deleted automatically a set number of days after approval (30 by default, set by the authority). Marks, dates and AI-versus-teacher figures are kept, linked only to the pupil code.

Evidence in this repository:

- `db/migrations/0006_oversight.sql`
- `src/server/dal/retention.ts`
- `tests/integration/oversight.test.ts` (retention)

### ours.deletion

**Confirmed.** Teachers can delete a pupil's work early. Deleting everything for a school needs two different admins, and every deletion is recorded in the audit log.

Evidence in this repository:

- `src/server/dal/retention.ts`
- `tests/integration/oversight.test.ts`
- `e2e/oversight.spec.ts`

### ours.audit

**Confirmed.** Sign-ins, scheme changes, marking runs, approvals, reopened marks, exports, deletions, settings and permission changes are recorded in an append-only audit log that school and authority admins can search.

Evidence in this repository:

- `src/server/audit.ts`
- `db/migrations/0001_foundation.sql` (append-only trigger)
- `tests/integration/rls.test.ts`

### ours.aggregates

**Confirmed.** Dashboards show aggregate figures only, and hide any figure built from fewer than 5 pupils or scripts.

Evidence in this repository:

- `src/server/oversight/figures.ts`
- `tests/unit/figures.test.ts`
- `tests/integration/oversight.test.ts` (dashboards)

### ours.passwords

**Confirmed.** Passwords are hashed with Argon2id. Sign-in is rate limited per account and per network address, and sessions expire after 8 hours by default.

Evidence in this repository:

- `src/server/password.ts`
- `src/server/auth/rate-limit.ts`
- `src/auth.ts`
- `tests/integration/login.test.ts`

### ours.photo-links

**Confirmed.** Photos are kept in private storage and are only ever shown through the app, using links signed for one user that expire after 5 minutes.

Evidence in this repository:

- `src/server/storage/signed-url.ts`
- `src/app/api/files/[fileId]/route.ts`
- `e2e/photos.spec.ts`

### ours.no-pupil-content-in-logs

**Confirmed.** Application logs record ids, counts and timings for marking, never pupil work, names or feedback.

Evidence in this repository:

- `src/server/marking/engine.ts` (log)
- `src/server/audit.ts` (metadata rule)

## The AI provider (Anthropic)

### provider.no-training

**Confirmed.** Anthropic's commercial terms do not allow it to train models on the content we send through the API.

Source: [Anthropic Commercial Terms of Service (effective 17 June 2025)](https://www.anthropic.com/legal/commercial-terms), read 2026-10-19.

> Anthropic may not train models on Customer Content from Services.

Source: [Claude docs: Vision](https://platform.claude.com/docs/en/build-with-claude/vision), read 2026-10-19.

> Anthropic does not use uploaded images to train models.

### provider.not-retained-by-default

**Confirmed.** Anthropic's API documentation says prompts and outputs are not retained by default, except for a named set of models that require 30-day retention. The model Red Pen uses by default is not one of them.

Source: [Claude docs: API and data retention](https://platform.claude.com/docs/en/manage-claude/api-and-data-retention), read 2026-10-19.

> Conversation content (your prompts and Claude's outputs) is not retained by default; the exception is Covered Models, which require 30-day retention.

Note: The Covered Models named are Claude Fable 5.1, Claude Mythos 5.1, Claude Fable 5 and Claude Mythos 5. ANTHROPIC_MODEL must not be set to one of these without updating this claim. The privacy centre article on standard retention could not be read (network blocked); see provider.retention-article.

### provider.flagged-retention

**Confirmed.** If Anthropic's automated safety systems flag a request, Anthropic may keep its inputs and outputs for up to 2 years, and may keep data where the law requires.

Source: [Claude docs: API and data retention](https://platform.claude.com/docs/en/manage-claude/api-and-data-retention), read 2026-10-19.

> if a chat or session is flagged, Anthropic may retain inputs and outputs for up to 2 years.

Note: This applies even under zero data retention. Pupil work is pseudonymised before sending, which limits what such retention could hold.

### provider.images-ephemeral

**Confirmed.** Photos sent with a request (as Red Pen sends them, inline) are deleted after the request is processed.

Source: [Claude docs: Vision (FAQ)](https://platform.claude.com/docs/en/build-with-claude/vision), read 2026-10-19.

> Image uploads are ephemeral and not stored beyond the duration of the API request. Uploaded images are automatically deleted after they have been processed.

### provider.zdr

**Confirmed.** Zero data retention is available from Anthropic by arrangement with its sales team. Red Pen does not have it yet.

Source: [Claude docs: API and data retention](https://platform.claude.com/docs/en/manage-claude/api-and-data-retention), read 2026-10-19.

> Under a ZDR arrangement, Anthropic does not store customer prompts or responses at rest after the API response is returned. To request ZDR for your organization, contact the Anthropic sales team.

### provider.processor

**Confirmed.** Anthropic's Data Processing Addendum is part of its commercial terms. Under it the customer is the controller and Anthropic the processor; for Red Pen, Anthropic acts as our sub-processor.

Source: [Anthropic Data Processing Addendum (effective 24 February 2025)](https://www.anthropic.com/legal/data-processing-addendum), read 2026-10-19.

> With respect to Customer Personal Data, Customer is the controller and Anthropic is Customer’s processor.

Source: [Anthropic Commercial Terms of Service](https://www.anthropic.com/legal/commercial-terms), read 2026-10-19.

> the Anthropic Data Processing Addendum (“DPA”), which is incorporated into these Terms by reference.

Note: Red Pen is itself a processor for schools, so the processor-to-processor transfer module is the relevant one.

### provider.uk-transfers

**Confirmed.** Transfers of UK personal data to Anthropic are covered by the ICO's International Data Transfer Addendum, which is part of Anthropic's processing addendum.

Source: [Anthropic Data Processing Addendum](https://www.anthropic.com/legal/data-processing-addendum), read 2026-10-19.

> “UK Addendum” means the International Data Transfer Addendum to the SCCs, issued by the Information Commissioner under S119A(1) Data Protection Act 2018

Note: Schools' DPIAs need a transfer risk assessment for the direct API route.

### provider.region-direct

**Confirmed.** On the direct Anthropic API there is no UK or EU processing option: the AI runs in any region (the default) or in the US only, and data held at rest is in the US.

Source: [Claude docs: Data residency](https://platform.claude.com/docs/en/manage-claude/data-residency), read 2026-10-19.

> "global" Default. Inference may run in any available geography for optimal performance and availability. "us" Inference runs only in US-based infrastructure.

Source: [Claude docs: Data residency](https://platform.claude.com/docs/en/manage-claude/data-residency), read 2026-10-19.

> Currently, "us" is the only available workspace geo.

Note: This is why Red Pen will move to an EU route before processing real pupil data (decision 2026-10-19). Until then, only invented demo data is used.

### provider.eu-routes

**Confirmed.** Claude is offered in the EU through Amazon Bedrock (including from the London region, routed within the EU) and through Google Cloud's EU multi-region endpoint; on those platforms the cloud provider is the data processor.

Source: [Claude docs: Claude in Amazon Bedrock](https://platform.claude.com/docs/en/build-with-claude/claude-in-amazon-bedrock), read 2026-10-19.

> Regional: the endpoint resolves to the single AWS region you specify, for data-residency requirements.

Source: [Claude docs: Claude on Vertex AI](https://platform.claude.com/docs/en/build-with-claude/claude-on-vertex-ai), read 2026-10-19.

> Multi-region endpoints: Dynamically route requests across regions within a geographic area (currently us and eu)

Source: [Claude docs: API and data retention](https://platform.claude.com/docs/en/manage-claude/api-and-data-retention), read 2026-10-19.

> On Amazon Bedrock and Google Cloud's Agent Platform, the cloud provider is the data processor.

Note: The Bedrock regions table lists eu-west-2 (London) with Global and EU routing, not in-region only, so a UK-only guarantee is not confirmed. AWS's own terms must be read before claiming anything about the Bedrock route.

### provider.certifications

**Confirmed.** Anthropic lists ISO 27001:2022, ISO/IEC 42001:2023 and SOC 2 Type I and Type II certifications for its commercial products.

Source: [Anthropic support: What certifications has Anthropic obtained?](https://support.claude.com/en/articles/10015870), read 2026-10-19.

> ISO 27001:2022 (Information Security Management) ISO/IEC 42001:2023 (AI Management Systems) SOC 2 Type I & Type II

Note: The audit reports themselves (dates, scope) are in Anthropic's Trust Portal, which could not be reached from here.

### provider.minors

**Confirmed.** Anthropic's usage policy treats anyone under 18 as a minor and sets extra guidelines for products serving minors, including telling users when they are interacting with an AI.

Source: [Anthropic Usage Policy](https://www.anthropic.com/legal/aup), read 2026-10-19.

> We define a minor or child to be any individual under the age of 18 years old, regardless of jurisdiction.

Source: [Anthropic support: Guidelines for organizations serving minors](https://support.claude.com/en/articles/9307344), read 2026-10-19.

> Organizations must disclose to their users that they are interacting with an AI system rather than a human.

Note: Pupils do not use Red Pen, and every AI suggestion is labelled as such for the teacher. Whether a teacher-only tool counts as a 'product serving minors' should be confirmed with Anthropic in writing. The usage policy page showed an effective date of 12 November 2026 with a link to the previous version; check which applies.

### provider.retention-article

**NOT CONFIRMED.** Anthropic's standard retention period for commercial API data, as stated in its privacy centre.

Open question: How long Anthropic keeps commercial API data under its standard terms, according to its privacy centre.

Note: privacy.claude.com is blocked by this environment's network policy. Read https://privacy.claude.com/en/articles/7996866 before quoting any number of days.

### provider.subprocessors

**NOT CONFIRMED.** Anthropic's own sub-processors and where they process data.

Open question: Which sub-processors Anthropic itself uses, and in which countries.

Note: The DPA points to https://www.anthropic.com/subprocessors, which redirects to trust.anthropic.com, blocked by this environment's network policy.

## UK guidance

### guidance.dfe-genai

**NOT CONFIRMED.** Red Pen's design against the Department for Education policy paper on generative AI in education (England).

Open question: How Red Pen measures up to the Department for Education's policy paper on generative AI in education (England).

Note: Read https://www.gov.uk/government/publications/generative-artificial-intelligence-in-education (blocked here).

### guidance.dfe-product-safety

**NOT CONFIRMED.** Red Pen against the Department for Education's generative AI product safety standards for edtech.

Open question: Which of the Department for Education's generative AI product safety standards apply to a teacher-only marking tool, and how Red Pen meets each.

Note: Search results suggest the 'expectations' were renamed 'standards' and updated in January 2026; unverified. Read https://www.gov.uk/government/publications/generative-ai-product-safety-standards (blocked here).

### guidance.de-ni-circular

**NOT CONFIRMED.** Red Pen against the Department of Education (Northern Ireland) guidance on generative AI for education professionals.

Open question: What the Department of Education (Northern Ireland) guidance on generative AI expects of tools used by teachers.

Note: Search results point to DE Circular 2026/02 (May 2026); unverified. education-ni.gov.uk is blocked here.

### guidance.ico-childrens-code

**NOT CONFIRMED.** Whether the ICO's Age Appropriate Design Code applies to Red Pen as a processor for schools.

Open question: Whether the ICO's Children's code applies to a service used by teachers, acting as a processor for schools.

Note: ico.org.uk is blocked here.

### guidance.ico-dpia

**NOT CONFIRMED.** When the ICO says a DPIA is required, as it applies to schools adopting Red Pen.

Open question: Whether the ICO's guidance makes a DPIA mandatory for a school adopting an AI marking tool. (We provide a DPIA template either way.)

Note: ico.org.uk is blocked here.

### guidance.automated-decisions

**NOT CONFIRMED.** How UK rules on automated decision-making, including changes under the Data (Use and Access) Act 2025, apply to marking with mandatory teacher approval.

Open question: How the UK rules on automated decision-making, as amended by the Data (Use and Access) Act 2025, treat marking where a teacher approves every mark.

Note: legislation.gov.uk and ico.org.uk are blocked here. Red Pen's design (no mark is final until a teacher approves it) is intended to keep decisions with the teacher, but we make no legal claim until this is read.
