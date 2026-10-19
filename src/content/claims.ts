// The claims register. Every statement the trust centre and the generated
// documents make about data handling is listed here with its evidence:
// - "ours": true because of how Red Pen is built; the evidence is the code and
//   the test that checks it.
// - "provider" and "guidance": about Anthropic or about UK guidance; the
//   evidence is the primary source, a short quote and the date it was read.
// docs/claims.md is generated from this file (npm run docs:claims) and a test
// fails if the two disagree. Only confirmed claims may appear in the product.

export type Source = { title: string; url: string; quote: string; checked: string };

export type Claim = {
  id: string;
  topic: "ours" | "provider" | "hosting" | "guidance";
  statement: string;
  status: "confirmed" | "unconfirmed";
  /** For "ours": file paths of the code and tests that make it true. */
  evidence?: string[];
  /** For "provider" and "guidance": where it was checked. */
  sources?: Source[];
  /** What is still open, or how the claim is limited. */
  note?: string;
  /** For unconfirmed claims: the open question, worded neutrally, which is all the product may show. */
  question?: string;
};

export const CLAIMS: Claim[] = [
  // -------------------------------------------------------------------------
  // How Red Pen is built
  // -------------------------------------------------------------------------
  {
    id: "ours.names-not-sent",
    topic: "ours",
    statement:
      "Pupil and staff names are never sent to the AI. Typed work has every name on the school's pupil and staff lists removed before sending, and the request carries no pupil code, school or teacher identity.",
    status: "confirmed",
    evidence: ["src/server/marking/redact.ts", "src/server/marking/prompt.ts", "tests/integration/marking-engine.test.ts (never sends pupil or staff names)"],
    note: "A name the school has not recorded (a sibling, a nickname) could remain in typed work. Teachers are told not to paste names.",
  },
  {
    id: "ours.photo-confirmation",
    topic: "ours",
    statement:
      "Names cannot be removed from a photo automatically, so a teacher must confirm names are cropped out or covered before each upload, and the confirmation is recorded.",
    status: "confirmed",
    evidence: ["src/server/dal/photos.ts", "tests/integration/photos.test.ts (refuses without the names-cropped confirmation)"],
  },
  {
    id: "ours.photo-metadata",
    topic: "ours",
    statement: "Location and other metadata (EXIF, XMP, IPTC) are removed from every photo before it is stored or sent to the AI.",
    status: "confirmed",
    evidence: ["src/server/uploads/image.ts", "tests/unit/photos.test.ts", "e2e/photos.spec.ts"],
  },
  {
    id: "ours.what-is-sent",
    topic: "ours",
    statement:
      "For each piece of work the AI receives the mark scheme, the total marks, the work type, the pupil's typed work with names removed, and any photos of the work. Nothing else.",
    status: "confirmed",
    evidence: ["src/server/marking/prompt.ts", "src/server/marking/claude.ts", "src/server/marking/engine.ts"],
  },
  {
    id: "ours.teacher-approves",
    topic: "ours",
    statement:
      "No mark or feedback is final until a teacher approves it, one pupil at a time. There is no 'approve all'. The AI's suggestion and the teacher's final mark are stored separately.",
    status: "confirmed",
    evidence: ["src/server/dal/marking.ts (approve)", "db/migrations/0002_teacher_core.sql (locks)", "e2e/marking.spec.ts", "e2e/ai-marking.spec.ts"],
  },
  {
    id: "ours.prompt-injection",
    topic: "ours",
    statement:
      "Pupil work is sent to the AI as delimited data, and the AI is told to ignore and flag any instructions inside it. The app also checks for such instructions itself; that work is marked low confidence and shown to the teacher first.",
    status: "confirmed",
    evidence: ["src/server/marking/prompt.ts", "src/server/marking/redact.ts (detectInjection)", "tests/unit/marking-engine.test.ts", "tests/integration/marking-engine.test.ts (a hostile script)", "e2e/ai-marking.spec.ts"],
  },
  {
    id: "ours.agreement-recorded",
    topic: "ours",
    statement:
      "Every change a teacher makes to an AI mark is recorded, and school and authority admins see how often teachers keep or change the AI's marks.",
    status: "confirmed",
    evidence: ["src/server/marking/marks.ts (agreement)", "src/server/dal/oversight.ts", "tests/integration/marking-engine.test.ts (records the agreement)", "tests/integration/oversight.test.ts"],
  },
  {
    id: "ours.no-release-to-pupils",
    topic: "ours",
    statement: "Pupils and parents have no access. Nothing is sent to a pupil automatically; teachers share feedback themselves.",
    status: "confirmed",
    evidence: ["src/server/roles.ts", "CLAUDE.md (non-goals)"],
  },
  {
    id: "ours.tenancy",
    topic: "ours",
    statement:
      "Teachers see only their own classes; school admins see their own school; authority admins see aggregates only, never pupil work. This is enforced in the application and again in the database with row-level security.",
    status: "confirmed",
    evidence: ["src/server/tenancy.ts", "db/migrations/0001_foundation.sql", "tests/integration/rls.test.ts", "tests/integration/routes.test.ts", "e2e/tenancy.spec.ts"],
  },
  {
    id: "ours.names-encrypted",
    topic: "ours",
    statement: "Pupil names, if a school imports them, are encrypted (AES-256-GCM) by the application and shown only to that class's teachers.",
    status: "confirmed",
    evidence: ["src/server/crypto.ts", "tests/unit/crypto.test.ts", "tests/integration/rls.test.ts"],
  },
  {
    id: "ours.retention",
    topic: "ours",
    statement:
      "Pupil work, photos, the AI's transcription, evidence quotes, comments and feedback are deleted automatically a set number of days after approval (30 by default, set by the authority). Marks, dates and AI-versus-teacher figures are kept, linked only to the pupil code.",
    status: "confirmed",
    evidence: ["db/migrations/0006_oversight.sql", "src/server/dal/retention.ts", "tests/integration/oversight.test.ts (retention)"],
  },
  {
    id: "ours.deletion",
    topic: "ours",
    statement:
      "Teachers can delete a pupil's work early. Deleting everything for a school needs two different admins, and every deletion is recorded in the audit log.",
    status: "confirmed",
    evidence: ["src/server/dal/retention.ts", "tests/integration/oversight.test.ts", "e2e/oversight.spec.ts"],
  },
  {
    id: "ours.audit",
    topic: "ours",
    statement:
      "Sign-ins, scheme changes, marking runs, approvals, reopened marks, exports, deletions, settings and permission changes are recorded in an append-only audit log that school and authority admins can search.",
    status: "confirmed",
    evidence: ["src/server/audit.ts", "db/migrations/0001_foundation.sql (append-only trigger)", "tests/integration/rls.test.ts"],
  },
  {
    id: "ours.aggregates",
    topic: "ours",
    statement: "Dashboards show aggregate figures only, and hide any figure built from fewer than 5 pupils or scripts.",
    status: "confirmed",
    evidence: ["src/server/oversight/figures.ts", "tests/unit/figures.test.ts", "tests/integration/oversight.test.ts (dashboards)"],
  },
  {
    id: "ours.passwords",
    topic: "ours",
    statement:
      "Passwords are hashed with Argon2id. Sign-in is rate limited per account and per network address, and sessions expire after 8 hours by default.",
    status: "confirmed",
    evidence: ["src/server/password.ts", "src/server/auth/rate-limit.ts", "src/auth.ts", "tests/integration/login.test.ts"],
  },
  {
    id: "ours.photo-links",
    topic: "ours",
    statement:
      "Photos are kept in private storage and are only ever shown through the app, using links signed for one user that expire after 5 minutes.",
    status: "confirmed",
    evidence: ["src/server/storage/signed-url.ts", "src/app/api/files/[fileId]/route.ts", "e2e/photos.spec.ts"],
  },
  {
    id: "ours.no-pupil-content-in-logs",
    topic: "ours",
    statement: "Application logs record ids, counts and timings for marking, never pupil work, names or feedback.",
    status: "confirmed",
    evidence: ["src/server/marking/engine.ts (log)", "src/server/audit.ts (metadata rule)"],
  },

  // -------------------------------------------------------------------------
  // The AI provider. Read 2026-10-19 on the live pages. The direct Anthropic API
  // is the route in use; an EU route (Amazon Bedrock) is planned before real
  // pupil data is processed (decision 2026-10-19).
  // -------------------------------------------------------------------------
  {
    id: "provider.no-training",
    topic: "provider",
    statement: "Anthropic's commercial terms do not allow it to train models on the content we send through the API.",
    status: "confirmed",
    sources: [
      { title: "Anthropic Commercial Terms of Service (effective 17 June 2025)", url: "https://www.anthropic.com/legal/commercial-terms", quote: "Anthropic may not train models on Customer Content from Services.", checked: "2026-10-19" },
      { title: "Claude docs: Vision", url: "https://platform.claude.com/docs/en/build-with-claude/vision", quote: "Anthropic does not use uploaded images to train models.", checked: "2026-10-19" },
    ],
  },
  {
    id: "provider.not-retained-by-default",
    topic: "provider",
    statement:
      "Anthropic's API documentation says prompts and outputs are not retained by default, except for a named set of models that require 30-day retention. The model Red Pen uses by default is not one of them.",
    status: "confirmed",
    sources: [
      {
        title: "Claude docs: API and data retention",
        url: "https://platform.claude.com/docs/en/manage-claude/api-and-data-retention",
        quote: "Conversation content (your prompts and Claude's outputs) is not retained by default; the exception is Covered Models, which require 30-day retention.",
        checked: "2026-10-19",
      },
    ],
    note: "The Covered Models named are Claude Fable 5.1, Claude Mythos 5.1, Claude Fable 5 and Claude Mythos 5. ANTHROPIC_MODEL must not be set to one of these without updating this claim. The privacy centre article on standard retention could not be read (network blocked); see provider.retention-article.",
  },
  {
    id: "provider.flagged-retention",
    topic: "provider",
    statement:
      "If Anthropic's automated safety systems flag a request, Anthropic may keep its inputs and outputs for up to 2 years, and may keep data where the law requires.",
    status: "confirmed",
    sources: [
      {
        title: "Claude docs: API and data retention",
        url: "https://platform.claude.com/docs/en/manage-claude/api-and-data-retention",
        quote: "if a chat or session is flagged, Anthropic may retain inputs and outputs for up to 2 years.",
        checked: "2026-10-19",
      },
    ],
    note: "This applies even under zero data retention. Pupil work is pseudonymised before sending, which limits what such retention could hold.",
  },
  {
    id: "provider.images-ephemeral",
    topic: "provider",
    statement: "Photos sent with a request (as Red Pen sends them, inline) are deleted after the request is processed.",
    status: "confirmed",
    sources: [
      {
        title: "Claude docs: Vision (FAQ)",
        url: "https://platform.claude.com/docs/en/build-with-claude/vision",
        quote: "Image uploads are ephemeral and not stored beyond the duration of the API request. Uploaded images are automatically deleted after they have been processed.",
        checked: "2026-10-19",
      },
    ],
  },
  {
    id: "provider.zdr",
    topic: "provider",
    statement: "Zero data retention is available from Anthropic by arrangement with its sales team. Red Pen does not have it yet.",
    status: "confirmed",
    sources: [
      {
        title: "Claude docs: API and data retention",
        url: "https://platform.claude.com/docs/en/manage-claude/api-and-data-retention",
        quote: "Under a ZDR arrangement, Anthropic does not store customer prompts or responses at rest after the API response is returned. To request ZDR for your organization, contact the Anthropic sales team.",
        checked: "2026-10-19",
      },
    ],
  },
  {
    id: "provider.processor",
    topic: "provider",
    statement:
      "Anthropic's Data Processing Addendum is part of its commercial terms. Under it the customer is the controller and Anthropic the processor; for Red Pen, Anthropic acts as our sub-processor.",
    status: "confirmed",
    sources: [
      { title: "Anthropic Data Processing Addendum (effective 24 February 2025)", url: "https://www.anthropic.com/legal/data-processing-addendum", quote: "With respect to Customer Personal Data, Customer is the controller and Anthropic is Customer’s processor.", checked: "2026-10-19" },
      { title: "Anthropic Commercial Terms of Service", url: "https://www.anthropic.com/legal/commercial-terms", quote: "the Anthropic Data Processing Addendum (“DPA”), which is incorporated into these Terms by reference.", checked: "2026-10-19" },
    ],
    note: "Red Pen is itself a processor for schools, so the processor-to-processor transfer module is the relevant one.",
  },
  {
    id: "provider.uk-transfers",
    topic: "provider",
    statement: "Transfers of UK personal data to Anthropic are covered by the ICO's International Data Transfer Addendum, which is part of Anthropic's processing addendum.",
    status: "confirmed",
    sources: [
      {
        title: "Anthropic Data Processing Addendum",
        url: "https://www.anthropic.com/legal/data-processing-addendum",
        quote: "“UK Addendum” means the International Data Transfer Addendum to the SCCs, issued by the Information Commissioner under S119A(1) Data Protection Act 2018",
        checked: "2026-10-19",
      },
    ],
    note: "Schools' DPIAs need a transfer risk assessment for the direct API route.",
  },
  {
    id: "provider.region-direct",
    topic: "provider",
    statement:
      "On the direct Anthropic API there is no UK or EU processing option: the AI runs in any region (the default) or in the US only, and data held at rest is in the US.",
    status: "confirmed",
    sources: [
      {
        title: "Claude docs: Data residency",
        url: "https://platform.claude.com/docs/en/manage-claude/data-residency",
        quote: "\"global\" Default. Inference may run in any available geography for optimal performance and availability. \"us\" Inference runs only in US-based infrastructure.",
        checked: "2026-10-19",
      },
      {
        title: "Claude docs: Data residency",
        url: "https://platform.claude.com/docs/en/manage-claude/data-residency",
        quote: "Currently, \"us\" is the only available workspace geo.",
        checked: "2026-10-19",
      },
    ],
    note: "This is why Red Pen will move to an EU route before processing real pupil data (decision 2026-10-19). Until then, only invented demo data is used.",
  },
  {
    id: "provider.eu-routes",
    topic: "provider",
    statement:
      "Claude is offered in the EU through Amazon Bedrock (including from the London region, routed within the EU) and through Google Cloud's EU multi-region endpoint; on those platforms the cloud provider is the data processor.",
    status: "confirmed",
    sources: [
      {
        title: "Claude docs: Claude in Amazon Bedrock",
        url: "https://platform.claude.com/docs/en/build-with-claude/claude-in-amazon-bedrock",
        quote: "Regional: the endpoint resolves to the single AWS region you specify, for data-residency requirements.",
        checked: "2026-10-19",
      },
      {
        title: "Claude docs: Claude on Vertex AI",
        url: "https://platform.claude.com/docs/en/build-with-claude/claude-on-vertex-ai",
        quote: "Multi-region endpoints: Dynamically route requests across regions within a geographic area (currently us and eu)",
        checked: "2026-10-19",
      },
      {
        title: "Claude docs: API and data retention",
        url: "https://platform.claude.com/docs/en/manage-claude/api-and-data-retention",
        quote: "On Amazon Bedrock and Google Cloud's Agent Platform, the cloud provider is the data processor.",
        checked: "2026-10-19",
      },
    ],
    note: "The Bedrock regions table lists eu-west-2 (London) with Global and EU routing, not in-region only, so a UK-only guarantee is not confirmed. AWS's own terms must be read before claiming anything about the Bedrock route.",
  },
  {
    id: "provider.certifications",
    topic: "provider",
    statement: "Anthropic lists ISO 27001:2022, ISO/IEC 42001:2023 and SOC 2 Type I and Type II certifications for its commercial products.",
    status: "confirmed",
    sources: [
      {
        title: "Anthropic support: What certifications has Anthropic obtained?",
        url: "https://support.claude.com/en/articles/10015870",
        quote: "ISO 27001:2022 (Information Security Management) ISO/IEC 42001:2023 (AI Management Systems) SOC 2 Type I & Type II",
        checked: "2026-10-19",
      },
    ],
    note: "The audit reports themselves (dates, scope) are in Anthropic's Trust Portal, which could not be reached from here.",
  },
  {
    id: "provider.minors",
    topic: "provider",
    statement:
      "Anthropic's usage policy treats anyone under 18 as a minor and sets extra guidelines for products serving minors, including telling users when they are interacting with an AI.",
    status: "confirmed",
    sources: [
      { title: "Anthropic Usage Policy", url: "https://www.anthropic.com/legal/aup", quote: "We define a minor or child to be any individual under the age of 18 years old, regardless of jurisdiction.", checked: "2026-10-19" },
      {
        title: "Anthropic support: Guidelines for organizations serving minors",
        url: "https://support.claude.com/en/articles/9307344",
        quote: "Organizations must disclose to their users that they are interacting with an AI system rather than a human.",
        checked: "2026-10-19",
      },
    ],
    note: "Pupils do not use Red Pen, and every AI suggestion is labelled as such for the teacher. Whether a teacher-only tool counts as a 'product serving minors' should be confirmed with Anthropic in writing. The usage policy page showed an effective date of 12 November 2026 with a link to the previous version; check which applies.",
  },
  {
    id: "provider.retention-article",
    topic: "provider",
    statement: "Anthropic's standard retention period for commercial API data, as stated in its privacy centre.",
    status: "unconfirmed",
    question: "How long Anthropic keeps commercial API data under its standard terms, according to its privacy centre.",
    note: "privacy.claude.com is blocked by this environment's network policy. Read https://privacy.claude.com/en/articles/7996866 before quoting any number of days.",
  },
  {
    id: "provider.subprocessors",
    topic: "provider",
    statement: "Anthropic's own sub-processors and where they process data.",
    status: "unconfirmed",
    question: "Which sub-processors Anthropic itself uses, and in which countries.",
    note: "The DPA points to https://www.anthropic.com/subprocessors, which redirects to trust.anthropic.com, blocked by this environment's network policy.",
  },

  // -------------------------------------------------------------------------
  // Hosting (Fly.io, decision 2026-10-19). Read from Fly's documentation
  // repository (github.com/superfly/docs at 2f68a40, 16 October 2026), which
  // is the source of fly.io/docs; fly.io itself is blocked from this environment.
  // -------------------------------------------------------------------------
  {
    id: "hosting.region",
    topic: "hosting",
    statement: "The app, its database and its stored photos run on Fly.io in London. Fly's servers and storage volumes stay in the region where they are created.",
    status: "confirmed",
    sources: [
      { title: "Fly.io docs: Regions", url: "https://fly.io/docs/reference/regions/", quote: "Fly Volumes and Fly Machines are tied to the region they're created in.", checked: "2026-10-19" },
      { title: "Fly.io docs: Volumes overview", url: "https://fly.io/docs/volumes/overview/", quote: "Each volume exists on one server in a single region. It is not network storage.", checked: "2026-10-19" },
    ],
    note: "Configured in fly.toml and deploy/db/fly.toml (primary_region lhr). Fly's global object storage (Tigris) is deliberately not used, because it replicates data worldwide.",
  },
  {
    id: "hosting.encryption",
    topic: "hosting",
    statement: "The database and photos are on storage volumes that are encrypted at rest, and so are their snapshots.",
    status: "confirmed",
    sources: [
      {
        title: "Fly.io docs: Volumes overview",
        url: "https://fly.io/docs/volumes/overview/",
        quote: "Volumes are, by default, created with encryption-at-rest enabled for additional protection of the data on the volume.",
        checked: "2026-10-19",
      },
      { title: "Fly.io docs: Volume snapshots", url: "https://fly.io/docs/volumes/snapshots/", quote: "Snapshots of encrypted volumes (defaults to true) are likewise encrypted at rest.", checked: "2026-10-19" },
    ],
    note: "deploy/fly-setup.sh creates the volumes without --no-encryption.",
  },
  {
    id: "hosting.snapshots",
    topic: "hosting",
    statement: "Fly takes a snapshot of each volume every day; Red Pen keeps 14 days of them.",
    status: "confirmed",
    sources: [
      {
        title: "Fly.io docs: Volume snapshots",
        url: "https://fly.io/docs/volumes/snapshots/",
        quote: "We automatically take daily snapshots of all Fly Volumes. We store snapshots for 5 days by default, but you can set volume snapshot retention from 1 to 60 days.",
        checked: "2026-10-19",
      },
    ],
    note: "Retention is set to 14 days in deploy/fly-setup.sh and both fly.toml files. Snapshots are of the whole volume, so deleted pupil work can remain in a snapshot for up to 14 days after deletion; the trust centre's retention section should say so before real data.",
  },
  {
    id: "hosting.snapshot-location",
    topic: "hosting",
    statement: "Where Fly.io stores volume snapshots.",
    status: "unconfirmed",
    question: "Which country Fly.io stores volume snapshots in.",
    note: "Fly's documentation does not say. Ask Fly before claiming that backups stay in the UK.",
  },

  // -------------------------------------------------------------------------
  // UK guidance. Not yet read: gov.uk, ico.org.uk, legislation.gov.uk and the
  // Northern Ireland sites are blocked by this environment's network policy.
  // Nothing here may be claimed until it is read at the source.
  // -------------------------------------------------------------------------
  {
    id: "guidance.dfe-genai",
    topic: "guidance",
    statement: "Red Pen's design against the Department for Education policy paper on generative AI in education (England).",
    status: "unconfirmed",
    question: "How Red Pen measures up to the Department for Education's policy paper on generative AI in education (England).",
    note: "Read https://www.gov.uk/government/publications/generative-artificial-intelligence-in-education (blocked here).",
  },
  {
    id: "guidance.dfe-product-safety",
    topic: "guidance",
    statement: "Red Pen against the Department for Education's generative AI product safety standards for edtech.",
    status: "unconfirmed",
    question: "Which of the Department for Education's generative AI product safety standards apply to a teacher-only marking tool, and how Red Pen meets each.",
    note: "Search results suggest the 'expectations' were renamed 'standards' and updated in January 2026; unverified. Read https://www.gov.uk/government/publications/generative-ai-product-safety-standards (blocked here).",
  },
  {
    id: "guidance.de-ni-circular",
    topic: "guidance",
    statement: "Red Pen against the Department of Education (Northern Ireland) guidance on generative AI for education professionals.",
    status: "unconfirmed",
    question: "What the Department of Education (Northern Ireland) guidance on generative AI expects of tools used by teachers.",
    note: "Search results point to DE Circular 2026/02 (May 2026); unverified. education-ni.gov.uk is blocked here.",
  },
  {
    id: "guidance.ico-childrens-code",
    topic: "guidance",
    statement: "Whether the ICO's Age Appropriate Design Code applies to Red Pen as a processor for schools.",
    status: "unconfirmed",
    question: "Whether the ICO's Children's code applies to a service used by teachers, acting as a processor for schools.",
    note: "ico.org.uk is blocked here.",
  },
  {
    id: "guidance.ico-dpia",
    topic: "guidance",
    statement: "When the ICO says a DPIA is required, as it applies to schools adopting Red Pen.",
    status: "unconfirmed",
    question: "Whether the ICO's guidance makes a DPIA mandatory for a school adopting an AI marking tool. (We provide a DPIA template either way.)",
    note: "ico.org.uk is blocked here.",
  },
  {
    id: "guidance.automated-decisions",
    topic: "guidance",
    statement: "How UK rules on automated decision-making, including changes under the Data (Use and Access) Act 2025, apply to marking with mandatory teacher approval.",
    status: "unconfirmed",
    question: "How the UK rules on automated decision-making, as amended by the Data (Use and Access) Act 2025, treat marking where a teacher approves every mark.",
    note: "legislation.gov.uk and ico.org.uk are blocked here. Red Pen's design (no mark is final until a teacher approves it) is intended to keep decisions with the teacher, but we make no legal claim until this is read.",
  },
];
