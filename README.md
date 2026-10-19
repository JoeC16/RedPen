# Red Pen

AI-assisted homework marking for secondary schools. A teacher uploads a mark scheme and pupil work, Claude proposes marks with evidence and draft feedback, and the teacher reviews and approves. Education authorities and trusts see aggregate usage and quality.

"Red Pen" is a working name, set in one place with `APP_NAME`.

The build brief is [`CLAUDE.md`](CLAUDE.md). Progress is in [`docs/progress.md`](docs/progress.md) and decisions in [`docs/decisions.md`](docs/decisions.md).

## Status

- Step 1 (foundation): sign-in, the three roles, tenancy with row-level security, and the audit log.
- Step 2 (teacher core, no AI): classes, pupil import, assignments with mark schemes, typed work, the review queue and screen, manual marking, approval one pupil at a time, reopening, and CSV export.
- Step 3 (marking engine): AI marking through Claude or a built-in demo provider, background jobs, redaction, prompt-injection checks, rate limits and the evaluation harness.
- Step 4 (photos): photographed work, uploaded per pupil or in bulk by pupil code, with location data stripped and a names-cropped confirmation. The AI transcribes the photos and the transcription is shown next to them.
- Step 8 (deploy): Fly.io in London. A one-click first-time setup workflow, automatic deploys after green CI, a demo-reset workflow, backups with a restore that CI tests on every push, and an uptime check. See `docs/deploy.md`.
- Step 7 (demo hardening): a believable demo dataset built from real rows, demo-mode marking that works for every seeded pupil, loading and error pages, automated accessibility checks on every page in both themes, faster marking for a class of 30, and a rehearsed 15-minute demo script.
- Step 6 (trust): a public trust centre at `/trust` and printable documents (data sheet, DPIA and DPA templates, sub-processor list, accessibility statement), all generated from one claims register (`docs/claims.md`) that shows only claims checked against our code or a dated primary source.
- Step 5 (oversight): school and authority dashboards from aggregates (small groups hidden), the AI agreement metric, estimated time saved, hourly retention that deletes pupil work and keeps the marks, early deletion by teachers, two-admin deletion of a school's data, and audit log details.

Without `ANTHROPIC_API_KEY` the app runs in **demo mode**: AI marking returns fixed example results for the demo pupils, and a banner says so.

## Marking a class by hand

Sign in as `a.byrne@northgate.test`, then:

1. **My classes → New class**, then **Import pupils**. Paste or upload a CSV with a `code` column and an optional `name` column.
2. **New assignment**. Choose the type of work, paste the questions and mark scheme, set the total, and add one mark line per question or criterion. The lines must add up to the total. You can start from a saved scheme.
3. **Add typed work** pastes answers for several pupils at once, or add work on each pupil's page. You can also mark from paper without typing anything.
4. **Mark next pupil** opens the review queue in order: doubtful work first, approved work last. Enter a mark per line (half marks allowed) and feedback, then **Approve and go to next**. There is no "approve all".
5. **Export approved marks (CSV)** downloads approved marks and feedback for the markbook. Unapproved pupils are listed with no marks.
6. **Feedback sheets (PDF)** shows one printable page per approved pupil. Choose "Save as PDF" in the print dialog.

Approved marks are locked, in the app and in the database. **Reopen marks** needs a reason, which goes in the audit log. A pupil can be marked absent. Work handed in against the wrong assignment can be moved to another assignment in the same class.

## Run it locally

You need Node 22.18 or later and Docker (or a local PostgreSQL 16).

```sh
cp .env.example .env
docker compose up -d db          # Postgres 16; creates roles and databases from db/bootstrap.sql
npm ci
npm run db:migrate
npm run db:seed
npm run dev                      # http://localhost:3000
```

`npm run db:reset` drops, migrates and reseeds the dev database with the full demo dataset; add `-- --foundation-only` for just the small test fixture. Dates are relative to today, so reset before a demo.

If you use your own Postgres instead of Docker, run `db/bootstrap.sql` once as a superuser.

To run the production image locally: `docker compose --profile app up --build` (http://localhost:3000; it migrates on start, then run `npm run db:seed` from the host).

## AI marking

1. Add typed work, then **Run AI marking** on the assignment page. Each pupil is marked as a background job, and the page updates by itself.
2. The review queue lists failed, flagged and low-confidence work first.
3. Each pupil's review screen shows the AI's suggested mark per line, with a quote from the work as evidence and a one-sentence reason, plus the AI's confidence and anything to check. The teacher changes what they disagree with and approves.

Settings (see `.env.example`):
- `MARKING_MODE` and `ANTHROPIC_API_KEY` choose between live and demo marking.
- `ANTHROPIC_MODEL` (required for live marking; never hard-coded), `MARKING_EFFORT` and `ANTHROPIC_FALLBACKS` control the model.
- The `MARKING_LIMIT_*` variables set the hourly rate limits.
- `MARKING_WORKER=off` turns off the in-process worker; then run `npm run worker` separately.

Photos: **Upload photos** on the assignment page takes many files or a whole folder, matched to pupils by the code at the start of each file name (`NG10M01.jpg`, `NG10M01-2.jpg`). Teachers must confirm names are cropped out, because names in a photo cannot be removed automatically. Storage is a local folder in development (`STORAGE_DRIVER=local`) and a private S3-compatible bucket in production (`STORAGE_DRIVER=s3`, see `.env.example`).

Names never go to the model. Every pupil and staff name in the school is replaced with `[name]` before sending.

## Evaluation harness

`npm run eval` marks every case in `/eval` with the current prompt. It reports, by work type:
- exact line agreement
- agreement within one mark per script
- how often high confidence matched the reference
- time and cost per script

`--provider=demo` forces demo mode. `--check` fails if agreement within one mark falls more than `EVAL_MAX_DROP` below `eval/baseline.json`. `--update-baseline` records a live run as the new baseline.

The eight current cases are synthetic, with reference marks written by Claude, not teachers. Do not quote their figures as teacher agreement.

## Demo logins

Every account uses the password `redpen-demo-2026`. All people, schools and authorities are invented.

| Role | Email | Sees |
| --- | --- | --- |
| Authority admin | `authority.admin@demo-authority.test` | Demo Education Authority: 3 schools, dashboard, settings (retention, time saved), school data deletion, audit log, no pupil data |
| School admin | `admin@northgate.test` | Northgate High School: all 3 classes (codes only), school dashboard, school data deletion, school audit log |
| Teacher | `a.byrne@northgate.test` | Northgate 9S1 Science and 10M2 Maths, with pupil names |
| Teacher | `c.doyle@northgate.test` | Northgate 8E3 English |
| School admin | `admin@riverside.test` | Riverside College |
| Teacher | `g.kerr@riverside.test` | Riverside 9X Science |
| School admin | `admin@hillcrest.test` | Hillcrest Academy (no classes yet) |
| Authority admin | `admin@other-authority.test` | A second authority, for isolation testing |
| School admin / teacher | `admin@other-school.test`, `teacher@other-school.test` | The second authority's school |
| Disabled teacher | `former.teacher@northgate.test` | Cannot sign in |

The demo dataset adds more teachers to the Demo Education Authority: 12 active teachers, 22 classes across maths, science and English, about 500 pupils, and about 870 pieces of work over six weeks, in every state. Useful extra logins:

| Role | Email | Sees |
| --- | --- | --- |
| Teacher | `a.byrne@northgate.test` | 10M1 Maths, 30 pupils: "Algebra and area" is unmarked, ready to mark live (see `docs/demo-script.md`) |
| Teacher | `o.mcaleer@northgate.test` | 9E1 and 10E2 English: essays and short answers with draft AI marks to review |
| Teacher | `e.gallagher@riverside.test` | Riverside maths classes |
| Teacher | `s.kearney@hillcrest.test` | Hillcrest maths: a school that joined recently and marks more by hand |

The 15-minute demo is in `docs/demo-script.md`; `npm run test:demo` rehearses it in a browser.

## Tests

```sh
npm run typecheck
npm test            # Vitest: unit + integration against Postgres (resets the redpen_test database)
npm run build && npm run test:e2e   # Playwright against a production build (resets redpen_e2e), incl. axe accessibility checks
npm run test:demo                   # rehearses docs/demo-script.md on the full demo dataset (redpen_e2e_demo)
```

CI (`.github/workflows/ci.yml`) runs all of these on every push, plus the tenancy route tests with row-level security bypassed, `npm audit`, and a Docker image build.

## How tenancy is enforced

Hierarchy: Authority → School → Class → Pupil.

1. **Data-access layer** (`src/server/dal/`). Every query takes the signed-in user's context and filters by `school_id` (and `authority_id`). Routes and pages never query the database directly. The context is re-read from the database on every request, so disabling a user or changing a role takes effect at once.
2. **Row-level security** (`db/migrations/0001_foundation.sql`). The app connects as `redpen_app`, which owns no tables and cannot bypass RLS. `withTenant()` (`src/server/tenancy.ts`) sets the user, role, school and authority as transaction-local settings, and policies on every tenant table check them. No context means no rows.

Server actions (all writes) go through the same data-access functions; `tests/integration/marking.test.ts` checks each of them from a colleague, another school and the admins.

`tests/integration/routes.test.ts` calls every API route as users from one school aimed at another school's and another authority's ids, and fails if a new route is added without being covered. CI runs it, and the marking tenancy tests, twice: once normally and once with RLS bypassed, so each layer is proven on its own. `tests/integration/rls.test.ts` runs raw SQL with no `WHERE` clauses as the app role to prove the database layer.

| Role | Can see |
| --- | --- |
| Authority admin | Schools and staff in their authority, the authority's audit log. No classes, pupils, work or marks, enforced in the database. |
| School admin | Every class in their school with pupil codes (not names), staff, the school's audit log. Can create classes and share them with teachers. Can read (not change) pupil work and marks; each view is audit logged. |
| Teacher | Their own classes, with pupil names, assignments, work and marks. Not colleagues' classes unless a school admin shares them. No audit log. |

## Layout

```
db/bootstrap.sql            roles and databases for local dev and CI
db/migrations/              plain SQL migrations, applied in order with checksums
scripts/                    migrate, seed, reset; scripts/lib/fixtures.ts is the shared fixture
src/auth.ts                 Auth.js (email and password, JWT session holding only the user id)
src/server/tenancy.ts       Ctx type and withTenant()
src/server/dal/             all data access
src/server/audit.ts         audit event writer
src/app/                    pages and API route handlers
tests/                      Vitest unit and integration tests
e2e/                        Playwright tests
```
