# Progress

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

- The per-pupil PDF feedback sheet from the teacher workflow. No build step names it. I have a question for you about this.
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
