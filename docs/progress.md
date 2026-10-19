# Progress

## Step 8: Deploy (built and tested in CI; waiting for the founder's Fly.io account to go live)

Built (details in `docs/deploy.md`):

- **Fly.io in London**, as the founder chose.
  - **Web app:** one always-on Machine, so the marking worker and the hourly retention job keep running. Fly's auto-stop ignores background work.
  - **Photos:** on a London volume. Not Fly's object storage, which replicates worldwide.
  - **Database:** our own PostgreSQL 16 app on the private network only, with no public IP. Founder's choice: Fly Managed Postgres offers only preset users, and its docs don't confirm row-level security would still hold the app.
- **First-time setup** is a GitHub workflow (**Fly.io first-time setup**). It creates both apps and their volumes, generates every secret on the runner without printing it, deploys the database and the app, and waits for the site to report healthy. It is safe to re-run.
- **Deploys.** After setup, every green CI run on `main` deploys automatically, then checks the live site. Migrations run as Fly's release command first, so a failed migration leaves the old version running.
- **Demo reset.** A **Reset demo data** workflow (type RESET) reseeds the demo dated to today. On first start, a demo deployment seeds itself into an empty database. Both are refused unless `ALLOW_DEMO_SEED=true`. The reset script is bundled into the image (`npm run build:scripts`), because Node can't run our TypeScript scripts directly.
- **Backups.**
  - Fly's daily encrypted volume snapshots, kept 14 days.
  - Logical backups: `scripts/db-backup.sh` leaves out the job queue; `scripts/db-restore.sh` restores.
  - `scripts/verify-restore.ts` checks a restore table by table with a row fingerprint, plus the security policies, the lock triggers, the append-only audit log and tenancy as the app role. I tested that it catches a single changed row.
- **Uptime.** A GitHub workflow checks health, HTTPS and the security headers from outside every 15 minutes once `PUBLIC_URL` is set. Fly's own check stops routing to an unhealthy Machine; Fly's docs say it does not restart it.
- **Security fixes found while preparing production:**
  - Sign-in rate limiting used the left-most `X-Forwarded-For` entry, which a client can forge to dodge the per-address limit. It now uses a header the proxy sets (`CLIENT_IP_HEADER=fly-client-ip` on Fly), or else the right-most entry.
  - The container now starts as root only to prepare the mounted volume, then drops to the app user before running anything.
- **Trust centre:**
  - New hosting claims quoted from Fly's docs: London region, encryption at rest, daily snapshots.
  - Where Fly stores snapshots is listed as not confirmed.
  - A sentence states that deleted work can remain in a backup for up to the backup retention period (`BACKUP_RETENTION_DAYS`).

Tested:
- **CI now runs the production image as Fly will:**
  - migration the way the release command runs it;
  - start-up with a root-owned volume;
  - self-seeding, health, pages and the HSTS header;
  - a check that the server is not root and can write to the volume;
  - then backup, restore and verification of that data.
- **Locally:**
  - the bundled reset run as production would run it, including the guard refusing without `ALLOW_DEMO_SEED`;
  - backup, restore and verify;
  - the client-address unit tests.

Not done or not checked:
- **Nothing is live yet.** It needs the founder's Fly account and the `FLY_API_TOKEN` secret, after which the setup workflow is the first real run. This environment can't reach fly.io, so no Fly command has been run from here; every command and setting was checked against Fly's documentation repository (16 October 2026).
- **A snapshot restore on Fly hasn't been practised.** The logical restore is tested in CI.
- **One database Machine:** no automatic failover. Acceptable for demos with invented data, and listed in `docs/deploy.md` under "Before real pupil data".

## Step 7: Demo hardening (done)

Built:

- **Demo dataset** (`scripts/lib/demo-seed.ts`, run by `npm run db:seed` and `npm run db:reset`). It sits on top of the test fixture, adding:
  - 12 active teachers across three schools, 22 classes in maths, science and English (Years 8 to 11), about 500 pupils, and about 870 pieces of work over six weeks;
  - work in every state: unmarked, AI draft awaiting review, flagged, failed, absent, approved by hand or from the AI;
  - teacher changes to AI marks, mostly small, with wider disagreement on borderline essay bands;
  - work older than the retention period already deleted, as the hourly job would have done.

  The dates count back from the day it runs. Every figure on the dashboards is computed from these rows. Seeded run metadata uses the model name `demo-seed`, so it can't be mistaken for a live run.
- **Answer banks** (`src/server/demo/templates.ts`): seven CCEA-style assignments (three use the evaluation schemes). Each question has several invented pupil answers, each carrying the mark, evidence and comment a careful marker would give, and sometimes a flag or a different teacher mark.
  - The seed builds pupils' work from these answers.
  - DemoProvider marks the same work back from them, so pressing **Run AI marking** on the seeded class of 30 gives realistic results for every pupil, not placeholders. Work not built from the banks still gets an honest placeholder.
- **Live demo class:** Aoife Byrne's 10M1, "Algebra and area", 30 pupils, unmarked.
- **Error and loading states:**
  - an error page that shows a reference but no details, and says nothing saved has been lost;
  - a last-resort page for when the layout itself fails.
  - No route-level loading screen. I added one, and the tests caught that it made Next.js stream every page early: not-found pages, including another school's, returned 200 instead of 404, and one upload form was used before it was ready. Pages load in under about 100 ms, and marking has its own progress display. A test now checks that cross-school URLs return a real 404 status.
- **Accessibility:**
  - automated axe checks (WCAG 2.2 A and AA) on every main page, for every role, in light and dark, in the e2e suite;
  - a manual axe run on pages with full demo data (flagged review, mixed queue, populated dashboards);
  - a keyboard tab-order check on the review screen;
  - a pass at phone width. CI found that a wide audit log table scrolled sideways but couldn't be reached by keyboard. Tables are now focusable, labelled regions, and the narrow pass makes this check independent of how much data a page has.
- **Performance, class of 30:**

  | What | Before | After |
  | --- | --- | --- |
  | Queue page | | 50–100 ms |
  | Review page | | 45–100 ms |
  | Approve and go to next pupil | | about 200 ms |
  | CSV export | | about 140 ms |
  | Dashboard, warm (full dataset) | | about 110 ms |
  | Marking 30 in demo mode | 16 s | 7.5–8.5 s |
  | Queuing a class | 1.2 s | 0.6 s |

  Two fixes got there: the worker now polls every 1 s instead of every 2 s (`MARKING_POLL_SECONDS`), and the whole class is queued in one insert.
- **Demo script** (`docs/demo-script.md`), about 15 minutes: teacher, school leader, authority, trust centre. It includes what to say about the open questions, what to do if something goes wrong, and likely questions.
- **`npm run test:demo`** rehearses the script step by step in a browser against the full dataset, in its own database, and runs in CI.

Fixes from the click-through:
- With one flag, the AI panel read "Check these point". It now reads "Check this point" (and "Check these 3 points").
- Demo pupil codes like `NG10E215` were hard to read. They are now `NG10E2-15`.
- The seed dated "this week's" work in the future when run early on a Monday, so it skipped it. Dates are now counted back from now.
- Printed feedback sheets lost the "Demo data" marker, because the page header doesn't print. The sheet itself now carries it.
- The first version of the seed had teachers agreeing with the AI within one mark 100% of the time, which nobody would believe. It now has realistic disagreement.

Tests: 343 Vitest tests, including a scratch-database test of the whole demo seed and a check that every answer bank marks back consistently. The Playwright suite now includes 8 accessibility tests. The demo rehearsal passes.

Not checked:
- Screen reader testing (NVDA, JAWS, VoiceOver). Automated checks find only part of the problems; the accessibility statement says so.
- The error page's appearance with a real server error. It is typechecked, but I had no safe way to trigger one in the production build.
- Live AI timings. Demo mode only.

## Step 6: Trust centre and documents (done; UK guidance not yet checked)

Built:

- **Claims register** (`src/content/claims.ts`) with every statement the product makes about data handling:
  - Statements about our own system point at the code and tests that make them true. A test fails if any cited file is missing.
  - Statements about Anthropic quote the live source with the date read (2026-10-19).
  - Anything not yet checked is marked unconfirmed, with a neutrally worded question.
  - `docs/claims.md` is generated from it (`npm run docs:claims`), and a test fails if the two differ.
- **The product can only show confirmed claims.** Pages fetch text through `confirmed(id)`, which throws for an unknown or unconfirmed claim. Unconfirmed items appear only as their open question, in a "Still being checked" box.
- **Trust centre** (`/trust`), public so data protection officers can read it before buying, and linked from the sign-in page and every role's menu. It covers:
  - what goes to the AI and what never does, who can see what, and retention (the authority's own setting when signed in);
  - where data is stored, the AI provider, security, and the guidance we follow;
  - documents and contact details.
- **Documents**, each a printable page (Save as PDF; A4 checked):
  - the data sheet for data protection officers;
  - the impact assessment template, with ten risks and our measures pre-filled, and likelihood, severity and sign-off left blank for the school;
  - the data processing agreement template;
  - the sub-processor list;
  - the accessibility statement. It says the service is "partially compliant" and lists the known gaps.
  - When an authority's own user is signed in, its name and retention setting are filled in.
- **Company details** come from environment variables (`COMPANY_NAME`, `ICO_REGISTRATION_NUMBER`, `HOSTING_REGION`, `DPA_SIGNATORY`, `CYBER_INSURANCE` and others). Until set, each shows as a highlighted "[To be confirmed: …]".

What the sources say (details in `docs/claims.md`):
- **Confirmed for Anthropic:**
  - no training on API content;
  - prompts and outputs not retained by default, except for named "Covered Models" (our default model is not one);
  - flagged requests may be kept for up to 2 years;
  - inline images are deleted after the request;
  - zero data retention is available by arrangement;
  - the processing agreement is part of the terms, with the ICO's UK transfer addendum;
  - ISO 27001, ISO 42001 and SOC 2;
  - its guidelines on minors.
- **The direct API has no UK or EU processing option.** Inference runs globally or in the US, and data at rest is in the US. Founder decision: keep the direct API for demos with invented data, and move to an EU route (Bedrock) before real pupil data. The trust centre and documents say this.

Tests: 3 new Playwright tests:
- the public trust centre states only confirmed claims, and none of the unconfirmed statements appears;
- every document renders, and none contains an unconfirmed statement;
- an admin's documents are filled in with their authority's details.

Also 6 new unit tests on the register. Totals: 315 Vitest tests, 24 Playwright tests.

Also fixed a step-5 test that assumed approvals made 38 hours earlier fall in the current week; it failed on Monday mornings.

Checked by hand in a browser (light and dark) and as a printed PDF: the trust centre, the impact assessment, the data sheet and the sub-processor list. Fixes from this: detail tables printed an empty header row, and the retention sentence repeated itself.

Not checked:
- **UK guidance.** gov.uk, ico.org.uk, legislation.gov.uk and the Northern Ireland education sites are blocked by this environment's network policy. Six questions are open:
  - the DfE generative AI policy paper;
  - the DfE product safety standards;
  - the DE NI circular;
  - whether the Children's code applies to us;
  - whether a DPIA is mandatory;
  - automated decision-making under the Data (Use and Access) Act.
  None of them is claimed anywhere.
- **Two Anthropic pages:** the privacy centre article on standard retention, and Anthropic's own sub-processor list (privacy.claude.com and trust.anthropic.com are blocked).
- **Legal review.** The agreement and DPIA templates have had none.

## Step 5: Oversight (done)

Built:

- Migration `0006_oversight.sql`.
- **Dashboards** for school admins (their school) and authority admins (every school, or one), at `/dashboard`, over the last 6, 13 or 52 weeks:
  - scripts added, pupils and assignments marked, share approved, median time from upload to approval, flagged rate;
  - **agreement with the AI** by work type: kept unchanged, and approved total within 1 mark of the AI's (the same measure as the evaluation harness);
  - **estimated teacher time saved**, with the minutes per script shown and editable by the authority admin;
  - adoption: active teachers per school per week, and approvals per week;
  - estimated AI cost per script, shown only when model prices are configured.
- The figures come from security-definer functions that return only aggregates, computed from real rows. Teachers cannot call them, and an admin only gets their own school or authority.
- **Small groups are hidden**: any figure built from 1 to 4 pupils or scripts reads "fewer than 5". Where a breakdown is shown next to its total and only one cell is hidden, the next smallest is hidden too, so it cannot be worked out by subtraction. Teacher counts are shown per school, never per teacher.
- **Retention**: an hourly job (pg-boss schedule) deletes the content of approved work past the authority's retention date: typed work, photos (rows and stored files), the AI's transcription and feedback draft, evidence quotes, comments, flag wording, and feedback. Marks, dates and agreement figures are kept, linked only to the pupil code. Each run writes one audit event per school. Deleted work can't be reopened, and the database refuses to put content back.
- Photo files are deleted through a queue table filled in the same transaction as the rows, so a storage outage delays deletion but never loses track of a file.
- **Settings** (`/settings`, authority admin): retention period (rescheduling approved work already held) and minutes per script. Both audit logged.
- **Teacher early deletion** on the review screen, behind a confirmation box. Approved work is deleted as retention would; unapproved work is removed entirely with its draft marks.
- **Delete everything for a school** (`/data`): one admin requests, a different admin confirms within 24 hours, each typing the school's name. Either can be that school's admin or an authority admin. It deletes every class, pupil, assignment, piece of work, photo, mark and approval; it keeps the school, staff accounts and the audit log. Request, cancel and deletion are audit logged with counts.
- **Audit log**: a details column (counts, reasons, settings; no ids), action suggestions for searching, and "Automatic (retention job)" as the actor for retention.

Tests: 309 Vitest tests and 21 Playwright tests. New ones cover the dashboard figures against known rows, suppression, scope (school admins only see their own school, whatever they ask for; other authorities get nothing; teachers are refused by the database), retention (what is deleted, what is kept, files removed, audit event, no reopening or restoring), rescheduling, early deletion, and the two-admin flow (same admin refused, other school refused, expiry, cancel, only that school's data deleted).

Checked by hand in a browser (light and dark): the authority dashboard with sample rows, school dashboard, settings, school data page, the review screen after deleting work, and the audit log. Fixes from this:
- Staff counts were always 0, here and on the step 1 Schools page. Drizzle left the column names unqualified inside the subquery, so it compared the user table with itself. Both are now written out in full, and a test checks the counts.
- Added a note explaining why a second figure is sometimes hidden.

Not checked:
- The schedule firing on the clock. I checked the server registers it (`17 * * * *`, Europe/London) and that a job sent to the queue runs the retention handler; the job itself is tested directly.
- Dashboards with realistic volumes. The seeded data has only a few scripts, so most figures read "fewer than 5". Step 7 seeds six weeks of history.

## Step 4: Photos and maths (done, in demo mode; live AI transcription not yet run)

Built:

- Migration `0005_photos.sql`: `submission_file` (storage key, type, size, page number, original file name, and the teacher's names-cropped confirmation), row-level security like the work itself (class teachers; school admins read-only), and a lock on photos of approved work.
- Storage behind one interface:
  - The `local` driver uses a folder, for development.
  - The `s3` driver uses a private S3-compatible bucket with server-side encryption, for production.
  - Object keys hold only the school id and a random id, never pupil identifiers.
- Upload validation:
  - The file type is checked from the bytes: JPEG, PNG or WebP only.
  - 5 MB per photo (the AI provider's limit), at most 6 photos per pupil.
  - iPhone HEIC gets a clear message explaining how to switch to JPEG.
- Metadata removal: EXIF (including GPS location), XMP, IPTC and comments are stripped from every photo. Only the JPEG orientation is kept, so photos still display the right way up.
- Names can't be redacted from a photo, so every upload needs the teacher to confirm names are cropped out or covered. The confirmation is stored on the file and in the audit log.
- Bulk upload: choose many files or a whole folder. Each file is matched to a pupil by the code its name starts with (`NG10M01.jpg`, `NG10M01-2.jpg`). Pages are ordered by file name, and unmatched files are listed with the reason.
- Photos are served only through the app, using links that are signed for one user and expire after 5 minutes. The route also checks the session and that the viewer may see that pupil's work. It sends `no-store`, `nosniff` and a sandboxing CSP. The bucket is never exposed.
- Marking from photos:
  - Photo-only work counts as work and can be sent for AI marking.
  - The worker loads the photos and the Claude provider sends them as image blocks, asking for a transcription first (Appendix A's maths rule).
  - Each run records which photos it read.
- Review screen:
  - Photos appear side by side with the AI transcription, so misreads are visible.
  - A warning appears when the photos have changed since the AI read them.
  - Teachers can remove a page or add photos for one pupil.
- Demo mode does not pretend to read photos. It says so in the transcription box and in a flag, and proposes no marks.

Acceptance: `e2e/photos.spec.ts` uses real JPEGs drawn in the browser, one carrying GPS metadata:
1. Bulk upload refuses until the confirmation box is ticked, then matches two files by pupil code in the right page order and lists one unmatched file with the reason.
2. The photos display, so the stripped JPEG still decodes, and the served file has no GPS data.
3. Marking from the photos shows the transcription next to them.
4. The teacher's signed link gives 403 to the school admin and 401 when signed out.
5. Removing a page shows the "photos have changed" warning.

Tests: 286 Vitest tests and 18 Playwright tests. The S3 driver is tested against a real S3 API (Adobe S3Mock) locally and in CI; MinIO no longer publishes images. Both new API routes are in the cross-school route sweep.

Checked by hand in a browser (light and dark): the bulk upload page and the review screen with photos and transcription. Fixes from this and from the tests:
- Bulk uploads numbered `NG01-2.jpg` as page 1 before `NG01.jpg`. Files are now ordered by name without the extension.
- A transcription made from photos that were later changed gave no warning. It now does.
- A storage key starting with `/` was not explicitly refused by the local driver. It is now.
- One browser test occasionally hung when signing in the next user. It moved on before sign-out had finished, so `/login` redirected the still-signed-in user and the email field never appeared. It now waits for sign-out to complete. My first guess, slowness, was wrong: a longer time limit didn't fix it in CI.

Not checked:
- Live AI transcription of real handwriting (no API key here). This is the main thing to try with a key: real phone photos of maths working.
- Deleting photos from storage when work is deleted by retention. That comes with the retention job in step 5.
- The Docker image with photos: CI builds it.

## Step 3: Marking engine (done, in demo mode; live AI not yet run)

Built:

- `MarkingProvider` with two implementations:
  - `ClaudeProvider` (`src/server/marking/claude.ts`):
    - Uses the Anthropic SDK. The model comes only from `ANTHROPIC_MODEL`.
    - Requests structured JSON output. The instructions and mark scheme are cached across a class.
    - Server-side fallback when the model declines for policy reasons (`ANTHROPIC_FALLBACKS`).
    - Thinking effort is set by `MARKING_EFFORT`.
    - Refusals and API errors become reasons a teacher can read, each marked retryable or not.
  - `DemoProvider`:
    - Fixed, realistic results for the demo pupils, keyed by a hash of the work type, scheme and work.
    - Anything else gets a labelled placeholder that proposes no marks.
    - Used when `MARKING_MODE=demo` or no API key is set. A banner says so on every page.
- The prompt follows Appendix A, with the teacher's mark lines listed so the model returns one line per question. It is versioned (`PROMPT_VERSION`).
- Every result is validated with zod and retried once if invalid. A second invalid answer marks the work `failed` with a readable reason.
- Results are fitted to the teacher's scheme:
  - Half-mark rounding and clamping to 0..max.
  - The scheme's maxima win.
  - Lines are matched by label.
  - Each correction becomes a flag. A flag is also raised when the AI's maxima do not add up to the total.
- Redaction: every pupil name and staff name in the school (full names and name parts, word boundaries, any case) is replaced with `[name]` before sending. The teacher still sees the original.
- Prompt injection:
  - Pupil work is delimited, and a pupil cannot close the delimiter.
  - The prompt tells the model to ignore and flag instructions.
  - A local check flags hostile work and drops confidence to low whatever the model says, so the work sorts to the top of the queue.
- Jobs run on pg-boss in its own schema, as the requesting teacher, so row-level security applies to the worker.
  - Retries with backoff for retryable errors.
  - Idempotent per job.
  - One failure never blocks the rest.
  - Stuck jobs are re-queued by the next class run.
  - The worker runs in the web server by default (`MARKING_WORKER`), or alone with `npm run worker`.
- Rate limits per teacher and per school per hour, with a clear message. Every run records model, prompt version, token counts (including cache reads) and latency. Logs carry ids and numbers only.
- Teacher screens:
  - "Run AI marking" for the class, with live progress that survives a refresh.
  - Queue columns for AI confidence and flags (in words, not colour alone).
  - On the review screen:
    - An AI suggestion panel with confidence and the flags to check.
    - For each line, the suggested mark, its evidence, the AI's reason, and a "you changed this" marker when the teacher's mark differs.
    - AI draft feedback, labelled as a draft.
    - "Mark again with AI", and "Try again" on failure.
- Approving an AI-marked pupil records the agreement data (AI total and lines changed). The AI's marks stay in `ai_awarded`, separate from `final_awarded`.
- Evaluation harness, `npm run eval`:
  - Eight prototype cases in `/eval/short`, `/eval/maths` and `/eval/essay`.
  - Reports exact line agreement, agreement within one mark per script, how often high confidence matched the reference, and time and cost per script, by work type.
  - `--check` fails CI if agreement within one mark drops more than `EVAL_MAX_DROP` below `eval/baseline.json`. CI calls the live AI when the prompt, engine or cases change and the `ANTHROPIC_API_KEY` secret exists; otherwise it runs in demo mode and warns.

**Important about the eight prototype cases.** You asked me to create them, so their reference marks are mine, not a teacher's. Every file, and every harness run, says so. Agreement figures from them must not be shown to authorities as teacher agreement until real teachers have marked the cases (target: 30 per type).

Acceptance:
- **Marking runs in both modes: partly met.** Demo mode is tested end to end in a browser (`e2e/ai-marking.spec.ts`): paste work, run AI marking, background jobs finish, the queue reorders doubt-first, the review shows suggestions, evidence, reasons, flags and draft feedback, and the teacher changes a mark and approves. Claude mode is covered by tests against a mocked SDK client (request shape, structured output, fallbacks, refusals, error mapping, token accounting). It has **not** been run against the live API, because this environment has no API key.
- **The harness prints agreement figures: met** (demo provider: 90% exact line agreement, 100% within one mark). Those figures say nothing about the AI.

Tests: 228 Vitest tests (unit tests for the engine, plus 13 integration tests through the real database) and 17 Playwright tests.

Checked by hand in a browser (light and dark): the queue after a class run, the review screen for a clear-cut pupil, a borderline pupil and a hostile script. Fixes from this:
- The demo placeholder pre-filled zero marks that a teacher could approve by accident. It now leaves the boxes blank.
- Draft AI rows showed no mark in the queue. They now show "AI: x / y (draft)".
- The "marking started" message vanished when marking finished quickly. The button now stays, disabled with a reason.
- The worker gave up if it started before the database was migrated. It now retries.

Not checked:
- A live Claude run. This needs `ANTHROPIC_API_KEY` locally and as a GitHub secret, plus the `ANTHROPIC_MODEL` repository variable, then `npm run eval -- --update-baseline` to record the first real baseline.
- The Docker image with the worker. My local build was blocked by Docker Hub rate limits (429); the CI `docker` job builds it.
- Photo marking and transcription (step 4).

## Step 2 follow-up: school admin read access and feedback sheets (done)

- School admins can open any assignment and pupil in their school read-only, with codes but no names. There are no marking controls. Each view of pupil work is audit logged. Row-level security allows them to read but not change, and refuses deleting approvals for everyone.
- Feedback sheets: one printed page per approved pupil (school, class, assignment, code and name, marks per line, total, feedback, approver and date). "Print or save as PDF" uses the browser. Available for the whole assignment or one pupil.
- Tests: 184 Vitest tests (school admin read-but-not-write at the data-access and database layers, other schools' admins still refused, audit of views, the feedback-sheet export) and 16 Playwright tests. The end-to-end flow now opens the feedback sheets and checks print mode hides the navigation, and the school admin journey checks the read-only review.
- Checked by hand: I generated the PDF from the page in Chromium and read it (one A4 page per pupil, black on white even from dark mode), and opened the school admin read-only review screen. This turned up a stale-CSS build issue, solved by a clean build. The app was not at fault.

## Step 2: Teacher core without AI (done)

Built:

- Migration `0002_teacher_core.sql`: `assignment`, `submission`, `mark_result`, `mark_line`, `approval`, all with `class_id` and `school_id` held consistent by composite foreign keys, and row-level security that lets only the class's teachers see them.
- Classes: teachers create classes (and become their teacher); school admins create classes and share them with teachers or remove access.
- Pupil import from pasted or uploaded CSV (`code` required, `name` optional and encrypted). Codes are unique across the school, checked without revealing other classes' pupils. All-or-nothing with row-numbered errors.
- Assignments: work type, mark scheme text, total, and one mark line per question or criterion, which must add up to the total. Reuse an earlier scheme. Editing the scheme starts a new scheme version: approved marks keep theirs, drafts go back to be marked, earlier runs stay as history.
- Work: paste typed answers in bulk or per pupil; mark absent; move work handed in for the wrong assignment to another assignment in the class.
- Review queue sorted doubt first (failed, flagged or low confidence, medium, other drafts, not marked, no work, absent, approved). The flag and confidence ordering is already in place for step 3.
- Review screen: work beside the mark lines, a mark per line (half marks, rounded and clamped), notes, feedback, live total, save draft, and approve one pupil at a time, which moves on to the next pupil. No "approve all".
- Approval writes an `approval` row (total, feedback snapshot, agreement fields left empty for manual runs), locks the marks, and sets `delete_after` from the authority's retention period. A database trigger enforces the lock as well as the app.
- Reopening needs a reason, keeps the earlier approval, and is audit logged. Earlier approvals show on the review screen.
- CSV export of approved marks per line, total, feedback, approver and time. Unapproved pupils appear with no marks; absent pupils are marked absent. Cells that start with a formula character are neutralised.
- Audit events for class creation, sharing, imports, assignment creation, scheme changes, work saved (length only, never content), absent, moves, approvals, reopens and exports.
- CI now runs on pull requests and on pushes to `main` only, which stops every PR running twice.

Acceptance: a teacher can mark a class by hand end to end. `e2e/marking.spec.ts` does exactly that in a browser: create a class, import three pupils, create an assignment (and see the "lines must add up" error), paste work, mark and approve two pupils (one with a half mark), mark one absent, export the CSV and check its contents, and reopen an approval with a reason.

Tests: 180 Vitest tests, 55 of them new: unit tests for marks and CSV, 22 integration tests for the marking workflow and its tenancy rules at both the data-access and database layer, and the export route added to the cross-school route inventory. 16 Playwright tests, 3 of them new.

Checked by hand in a browser (light and dark): class page, new assignment form, review queue, review screen in draft, approved and reopened states. Fixes from this and from the end-to-end test:

- React resets uncontrolled form fields after a server action, so a validation error wiped the teacher's typed title and mark scheme. All forms now keep their input.
- The "Draft saved" confirmation disappeared because the form remounted. Fixed.
- The queue showed draft totals the same way as approved ones. Drafts now say "(draft)".
- A blank "max marks" box was silently read as 0. It is now an error.
- Empty note boxes no longer show on locked marks.

Not built or not checked:

- Deleting a submission early. This is with retention in step 5.
- Screen reader testing (planned for step 7).


## Step 1: Foundation (done)

Built:

- Next.js 16 (App Router, TypeScript strict), Tailwind 4 with light and dark themes following the system setting.
- PostgreSQL 16 with plain SQL migrations (`db/migrations`) applied by a small runner that records checksums and refuses edited migrations. Drizzle is used for typed queries only; a test fails if its definitions drift from the migrated schema.
- Two database roles: `redpen_owner` (migrations) and `redpen_app` (runtime, subject to row-level security).
- Tables: `authority`, `school`, `app_user`, `class`, `class_teacher`, `pupil`, `audit_event`, `login_attempt`.
- Auth.js with email and password. Argon2id hashes. Sessions expire after 8 hours (configurable). Rate limiting per account (5 failures in 15 minutes) and per IP (30), stored as hashes. Sign-in, failed sign-in, rate-limited and sign-out events are audited.
- The three roles, with a tenancy data-access layer and row-level security as a second line of defence.
- Append-only audit log (trigger blocks update, delete and truncate even for the owner). Audit log screen for school and authority admins with search by actor, action and date.
- Pupil names encrypted with AES-256-GCM in the application; shown only to that class's teachers.
- Same-origin check on state-changing API requests; security headers; health endpoint.
- CI: typecheck, Vitest, tenancy tests with RLS bypassed, build, Playwright, `npm audit`, Docker build. Dependabot.
- `docker-compose.yml` for local Postgres, and a production Dockerfile (standalone Next.js, non-root, optional migrate on start).

Acceptance: cross-school access tests pass.

- Vitest: 125 tests (unit, RLS, route-level tenancy across every API route, login and rate limiting, schema drift).
- Playwright: 13 tests (sign-in, sign-out, wrong password, skip link, teacher/school admin/authority admin journeys, cross-school URL and API attempts, cross-site write rejected; smoke tests in light and dark).
- I checked the tests can fail: removing the data-access filters alone leaves isolation intact (RLS holds); bypassing RLS alone leaves it intact (the data-access layer holds); doing both makes 8 route tests fail.

Checked by hand in a browser (headless Chromium, screenshots in light and dark): login, teacher home, class list and class page with names, school admin class page without names, school admin and authority admin audit log, authority schools list, 404 for cross-school URLs. Two fixes came from this: failed sign-ins had been recorded with the account owner as the actor (now the account is only the target), and the audit log showed raw user ids as targets (now names where visible).

`docker compose up -d db` started Postgres with the bootstrap script, and `npm run db:migrate` and `npm run db:seed` ran against it.

Docker image built and run against a fresh database: migrations ran on start, health check passed, unauthenticated pages redirect to sign-in, security headers present.

Not checked:

- The GitHub Actions run itself until the PR is pushed.
- Screen reader testing and a full WCAG audit (axe checks are planned in step 7).
- The Docker image build ran here only with a sandbox-specific tweak (trusting this environment's network proxy certificate); the committed Dockerfile is otherwise identical and CI builds it unmodified.
