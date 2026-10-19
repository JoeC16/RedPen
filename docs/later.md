# Later

Ideas outside v1 scope. Not to be built until agreed.

- Pupil logins and parent access.
- Automatic release of approved feedback to pupils.
- Links to school management systems; Google Classroom and Teams integration.
- Manual light/dark theme toggle (v1 follows the system setting).
- Per-user preferences for date and time display.
- One-click .pdf download of feedback sheets (v1 uses the browser's Save as PDF).
- Resize or compress photos in the browser before upload, so higher-resolution phone photos fit under 5 MB.
- Convert HEIC to JPEG on upload (needs a native decoder).
- Upload PDFs of scanned work.
- Retention for drafts: delete unapproved work that has sat untouched for a set time.
- Per-class and per-assignment breakdowns on the school dashboard (with the same small-group rules).
- Download dashboard figures and the audit log as CSV.
- Offboarding a school completely, including staff accounts, after the data is deleted.
- Charts for the weekly trend (v1 uses a table with bars).
- EU AI route: a Bedrock provider (London endpoint, EU routing) behind the existing MarkingProvider interface, selected by an environment variable. Required before real pupil data; read AWS's own Bedrock data terms first.
- Ask Anthropic for zero data retention, and confirm in writing that it covers inline images.
- Confirm with Anthropic whether a teacher-only tool counts as a "product serving minors" under its usage policy.
- Read the blocked sources (gov.uk, ICO, legislation.gov.uk, DE NI, privacy.claude.com, trust.anthropic.com) and settle the open claims.
- Legal review of the DPA and DPIA templates; Welsh or Irish language versions if a buyer needs them.
- Managed Postgres in London with automatic failover and point-in-time recovery (check that the app role stays subject to row-level security), or a replica.
- Encrypted logical backups to UK or EU storage we control, on a schedule, with a recorded monthly restore drill.
- Practise restoring a Fly volume snapshot.
