# Decisions

One line per significant decision and the reason.

## Founder answers (2026-10-15)

- First demo: schools mostly use **Google Workspace**, so phase-2 single sign-on starts with Google, then Microsoft Entra ID. The authority's name is still to be confirmed.
- Curriculum framing for demo data: **CCEA (Northern Ireland)**. Year groups follow NI numbering (Years 8 to 14; KS3 is Years 8 to 10, GCSE Years 11 and 12).
- Product name: keep **Red Pen** for now, set in one place (`APP_NAME`).
- Data processing agreement signatory and cyber insurance: **not set up yet**. DPA and DPIA templates (step 6) will carry placeholders and the trust centre will not claim insurance.

## Step 1

- Table for users is `app_user`, not `user`, because `user` is reserved in Postgres.
- Plain SQL migrations with a small checksum-recording runner, not drizzle-kit, as the brief prefers plain SQL. Drizzle definitions mirror the SQL, guarded by a drift test.
- The app connects as a separate non-owner role (`redpen_app`) so RLS always applies; migrations and seeds use the owner role.
- Tenancy context is passed to Postgres as transaction-local settings (`set_config(..., true)`), so pooled connections cannot carry one request's context into another.
- Security-definer functions are used only where no tenancy context exists yet (sign-in lookup, session refresh, auth audit events) and to avoid recursive policies (`app_teaches_class`).
- `school_id` is repeated on `class_teacher` and `pupil` with composite foreign keys, so a row can never point at a class in another school, and policies stay simple.
- Pupil codes are unique per school, not per class, so bulk photo upload by code (step 4) is unambiguous.
- Authority admins have no row access to classes or pupils at all, enforced in the database. Their dashboards (step 5) will read aggregates through dedicated functions.
- School admins see pupil codes but not names; names are decrypted only for the class's teachers. The brief says names are shown only to the school's teachers.
- Pupil names are encrypted in the application with AES-256-GCM (key in `PUPIL_NAME_KEY`), so database backups and the database host never see them.
- Auth.js session is a JWT holding only the user id. Role, school and disabled status are read from the database on every request.
- Failed sign-ins return the same message for unknown email, wrong password and disabled account, and run Argon2 against a dummy hash for unknown emails, so accounts cannot be enumerated.
- Login rate limiting is stored in Postgres (hashed keys), so it works across several app instances without Redis.
- Cross-tenant ids return 404, not 403, so the existence of other schools' data is not revealed. Role-based refusals (a teacher opening the audit log API) return 403.
- The Next.js proxy (middleware) is not used for authentication; every page and route checks the session itself. The proxy only blocks cross-site writes to API routes.
- Dark mode follows the operating system setting. A manual toggle can come later.
- No ESLint for now to keep dependencies few; strict TypeScript plus tests. Accessibility checks with axe come in step 7.
- Next.js 16.3.8 rather than 16.4.x, which was days old. Vitest 4.1.11 because earlier versions have published vulnerabilities.
- The lockfile was generated with npm 11 because npm 10.9 crashes resolving Vitest 4's optional peer dependencies; `npm ci` works with npm 10.

## Step 2

- Teachers define one mark line per question or criterion when they create an assignment. The lines must add up to the total. Manual marking uses these lines, and in step 3 they give the AI a fixed structure to fill.
- Manual marking is stored as a `mark_result` run with `source = 'manual'` and empty `ai_awarded`. Manual and AI runs share one review screen and one approval path, and agreement figures count only AI runs.
- Marks are `numeric(5,1)` with a `half_mark` domain that allows only whole and half marks. Line maxima are whole numbers.
- ~~School admins cannot see pupil work, marks or feedback.~~ Superseded 2026-10-18, see below.
- Teachers can create classes and are assigned to them automatically (a security-definer function, so a teacher can never add themselves to a colleague's class). School admins share classes with teachers.
- Pupil codes stay unique per school. An import that clashes with any code in the school is refused, without revealing which class holds it.
- Editing a scheme increments `scheme_version`. A run belongs to an assignment and a scheme version, so drafts made under an older scheme or a different assignment stay as history and are not reused.
- Moving work to another assignment is only possible within the same class, before approval, and when the pupil has no work there yet.
- Approval sets `delete_after` = approval time + the authority's retention days (default 30). Reopening clears it.
- Approval is one pupil at a time. "Approve and go to next" saves the marks first, so a teacher never approves something other than what is on screen.
- Absent pupils cannot be marked or approved. They export as "absent".
- CSV export includes pupil names, since the export is for the class teacher's own markbook. Formula-like cells are prefixed with a quote mark.
- CI runs on pull requests and on pushes to `main`, not on every branch push, to avoid duplicate runs.

## Step 2 follow-up (2026-10-18)

- Founder decision: **school admins can read pupil work and marks in their school.** This is read-only: marking, approval, reopening and export stay with the class's teachers. Pupil names stay teacher-only. Each time a school admin opens a pupil's work, an audit event (`submission.viewed`) is recorded. Authority admins still see none of it (migration `0003_school_admin_read.sql`).
- The per-pupil feedback sheet is a printable page, one pupil per page, saved as PDF from the browser's print dialog. No PDF library, so no new dependency or server-side rendering. The output is accessible HTML and prints the same on any device. Teachers open it from the assignment (all approved pupils) or from one pupil's review screen. Generating sheets is audit logged (`export.feedback_sheets`). If a one-click .pdf download is needed later, it can be added behind the same data function.
- Print styles force black on white whatever the screen theme, and hide the navigation.

## Step 3 (2026-10-18)

- The eight prototype evaluation cases were written by Claude at the founder's request (the prototype file was not available). Their reference marks are synthetic and labelled so in every file and every harness report. They must be replaced or re-marked by teachers before agreement figures are quoted.
- The prompt lists the teacher's mark lines and asks for exactly one criterion per line. The scheme's labels and maxima override the model's, and every override is flagged. This makes the "maxima must add up" rule enforceable and the agreement metric line-by-line.
- The scheme and instructions are the system prompt, cached across a class run; only the pupil's work varies per request (lower cost for a class of 30).
- Structured outputs with a hand-written JSON schema, validated again with zod on our side (the brief's "validated with zod", and a second line of defence).
- `ClaudeProvider` uses server-side fallbacks (`fallbacks: "default"`) by default so a policy decline on one model is retried on Anthropic's recommended fallback. `ANTHROPIC_FALLBACKS=off` disables it. The model that actually answered is recorded in `mark_result.model`.
- `MARKING_EFFORT=high` by default: marking accuracy matters more than speed. It is configurable, like the model.
- Redaction replaces every pupil and staff name in the school, plus each name part of two or more letters, which can over-redact a common word that is also a name ("Grace"). Over-redaction is the safe failure.
- A local injection check runs independently of the model. A hit forces low confidence and a flag, so a fooled model cannot hide an attempt.
- AI suggestions pre-fill the mark boxes (the teacher still approves one pupil at a time). The demo placeholder proposes nothing, so its boxes stay blank.
- The AI's per-line reason is stored in `mark_line.ai_comment`, separate from the teacher's own note in `comment`.
- pg-boss runs in its own `pgboss` schema, created by the app role (migration 0004 grants CREATE on the database). Jobs carry only ids. The worker acts as the teacher who asked, so row-level security covers it.
- Rate limits default to 300 scripts per teacher and 1500 per school per hour, counted from a `marking_request` table through a security-definer function (the school-wide count crosses classes the teacher cannot see).
- The worker runs inside the web server by default (one deploy target), and can run alone with `npm run worker`. A production separate-worker setup is left to step 8.
- CI runs the eval harness on every PR. It calls the live AI only when `src/server/marking/` or `eval/` changes, to keep CI cost down.
- Playwright resets the e2e database in the web server command, before the app starts, so the queue worker never connects to a half-reset schema. It never reuses an already-running server.

## Step 8 (2026-10-19)

- Founder: Fly.io first, London (`lhr`).
- Founder: our own PostgreSQL 16 app on Fly, not Fly Managed Postgres. Managed Postgres offers only preset users (schema admin, writer, reader), and its docs don't confirm a writer would be held by row-level security, our second line of defence. To revisit before the pilot (managed, with failover).
- Photos on a Fly volume in London, not Fly's object storage (Tigris), whose docs describe worldwide replication with no documented way to pin a region.
- The web Machine is always on (auto-stop off, minimum one Machine), because Fly's docs say auto-stop does not count background work, and our marking worker and retention job run in-process.
- The demo site runs in demo mode (no API key), so no data leaves Fly; real data waits for the EU AI route.
- Secrets are generated by the setup workflow and go straight to Fly, never printed or stored in GitHub. Non-secret settings live in `fly.toml`.
- Migrations run as Fly's release command (once per deploy, before the new version starts), not on every Machine start.
- The deploy runs only after CI passes on `main`, and it checks the live site afterwards.
- Client address for rate limiting: a proxy-set header when one is configured, else the right-most `X-Forwarded-For` entry. The left-most entry is client-controlled.
- The GitHub Action for Fly is pinned to a commit (tag 1.6), not `@master` as Fly's example uses.

## Step 7 (2026-10-19)

- The demo data and DemoProvider share one set of answer banks. The seed builds pupil work from them and the provider marks it back, so live marking in a demo is realistic and never depends on the network. Work not built from the banks still gets an honest placeholder.
- The seed's dates are relative to the moment it runs, so "the last six weeks" always has data. Reset the demo the morning of a meeting.
- Seeded AI runs are labelled with the model `demo-seed`, and their token counts are invented. The cost tile on demo dashboards is therefore illustrative; the demo script says so.
- The full dataset stays out of the main test fixtures, which keep their small, exact data. It has its own scratch-database test and its own rehearsal (`npm run test:demo`, own database).
- Marking worker polls every 1 s (`MARKING_POLL_SECONDS`), and a class is queued in one bulk insert. pg-boss's burst mode needs batches larger than one job, and its notify mode is early access, so neither is used.
- No route-level `loading.tsx`. It makes Next.js stream responses before the page runs, so `notFound()` returns HTTP 200. A real 404 for another school's URL matters more than a loading spinner on pages that take about 100 ms.
- `@axe-core/playwright` 4.13.0 is pinned, not 4.14.0, which was only four days old.

## Step 6 (2026-10-19)

- Founder: the direct Anthropic API offers no UK or EU processing, so keep it for demos with invented data, and add an EU route (Claude on Amazon Bedrock, London endpoint with EU routing) before any real pupil data. The trust centre states the region for the route in use.
- One claims register in code. The pages, the documents and `docs/claims.md` all come from it, so a statement cannot be changed in one place and not the others.
- The product shows only confirmed claims, enforced by `confirmed()` throwing. Unconfirmed items are shown only as a neutral question.
- Our own claims cite the code and tests that make them true, and a test checks the files exist.
- The trust centre and documents are public pages, not files in the repo. DPOs can read them without an account, and the content always matches the running service. Templates leave the school's own judgements (likelihood, severity, lawful basis, sign-off) blank instead of guessing them.
- Company facts are environment variables that show a visible placeholder until set. We never invent a company number, ICO registration or hosting region.
- The accessibility statement says "partially compliant" until an independent audit is done.
- The default model must not be one of Anthropic's "Covered Models" (30-day retention required). This is noted against the claim.

## Step 5 (2026-10-18)

- Founder: retention deletes pupil work, photos, transcriptions, evidence, comments and feedback, and keeps marks, timestamps and AI-versus-teacher numbers linked only to the pupil code.
- Founder: "delete everything for this school" needs two different people; one requests, another confirms within 24 hours; either may be that school's admin or an authority admin.
- Founder: suppress figures built from fewer than 5 pupils or scripts; show active-teacher counts per school, never per teacher.
- Retention applies to approved work only. Unapproved work has no retention date yet; teachers can delete it, and a rule for stale drafts is in `docs/later.md`.
- Flag text is replaced with "removed" rather than deleted, because it can quote pupil work but the flagged rate needs the count.
- Deleted work can't be reopened. There is nothing left to re-mark from, and the database enforces it.
- Changing the retention period reschedules approved work still held, so the policy means one thing everywhere.
- "Agreement" is the approved total within 1 mark of the AI's total: the harness measure, so the dashboard and the evaluation numbers mean the same. "Kept unchanged" is shown alongside.
- Time saved counts only approved scripts the AI marked, times the authority's minutes per work type. It does not subtract checking time, and the page says so.
- Cost per script is shown only when model prices are set, and labelled as an estimate.
- School deletion keeps staff accounts, the school and the audit log. Removing staff is a separate decision (it would break the audit trail's actors).
- The admin types the school's name to request and to confirm, as well as needing two people.
- Secondary suppression: when exactly one cell in a breakdown is hidden and the total is shown, the next smallest is hidden too.
- Dashboards read through security-definer functions that return aggregates only, rather than giving admins row access.

## Step 4 (2026-10-18)

- Photos are stored in a private bucket and only ever served by the app, through links signed for one user that expire in 5 minutes. The route also checks the session and access, so a leaked link is useless to anyone else and quickly expires. No presigned bucket URLs are used.
- No image-processing library. Metadata is stripped by parsing the JPEG, PNG and WebP containers directly, so there are no native dependencies. Photos are not resized, so the 5 MB per-photo limit (the AI provider's) applies to the upload, and phones should use a normal camera resolution.
- The JPEG orientation tag is the only metadata kept. Without it, phone photos display sideways for the teacher and the model.
- HEIC is refused with instructions rather than converted, which would need a native decoder.
- Photos are uploaded one per request from the browser. Each request stays well under the proxy's body limit, and the page shows which files failed and why.
- Bulk matching uses the longest pupil code that the file name starts with, followed by the end of the name or a separator, so `NG10M012.jpg` is not taken as pupil `NG10M01`. Only codes in the assignment's class match.
- The names-cropped confirmation is required per upload and recorded per file (who and when) as well as in the audit log, as the brief asks for photos.
- Each AI run stores the ids of the photos it read, so the review screen can warn when photos change after marking. The teacher decides whether to mark again.
- Adobe S3Mock is used locally and in CI to test the S3 driver against a real S3 API, because MinIO stopped publishing public images.
