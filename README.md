# Red Pen

AI-assisted homework marking for secondary schools. A teacher uploads a mark scheme and pupil work, Claude proposes marks with evidence and draft feedback, and the teacher reviews and approves. Education authorities and trusts see aggregate usage and quality.

"Red Pen" is a working name, set in one place with `APP_NAME`.

The build brief is [`CLAUDE.md`](CLAUDE.md). Progress is in [`docs/progress.md`](docs/progress.md) and decisions in [`docs/decisions.md`](docs/decisions.md).

## Status

- Step 1 (foundation): sign-in, the three roles, tenancy with row-level security, and the audit log.
- Step 2 (teacher core, no AI): classes, pupil import, assignments with mark schemes, typed work, the review queue and screen, manual marking, approval one pupil at a time, reopening, and CSV export.

There is no AI marking yet (step 3).

## Marking a class by hand

Sign in as `a.byrne@northgate.test`, then:

1. **My classes → New class**, then **Import pupils**. Paste or upload a CSV with a `code` column and an optional `name` column.
2. **New assignment**. Choose the type of work, paste the questions and mark scheme, set the total, and add one mark line per question or criterion. The lines must add up to the total. You can start from a saved scheme.
3. **Add typed work** pastes answers for several pupils at once, or add work on each pupil's page. You can also mark from paper without typing anything.
4. **Mark next pupil** opens the review queue in order: doubtful work first, approved work last. Enter a mark per line (half marks allowed) and feedback, then **Approve and go to next**. There is no "approve all".
5. **Export approved marks (CSV)** downloads approved marks and feedback for the markbook. Unapproved pupils are listed with no marks.

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

`npm run db:reset` drops, migrates and reseeds the dev database.

If you use your own Postgres instead of Docker, run `db/bootstrap.sql` once as a superuser.

To run the production image locally: `docker compose --profile app up --build` (http://localhost:3000; it migrates on start, then run `npm run db:seed` from the host).

## Demo logins

Every account uses the password `redpen-demo-2026`. All people, schools and authorities are invented.

| Role | Email | Sees |
| --- | --- | --- |
| Authority admin | `authority.admin@demo-authority.test` | Demo Education Authority: 3 schools, audit log, no pupil data |
| School admin | `admin@northgate.test` | Northgate High School: all 3 classes (codes only), school audit log |
| Teacher | `a.byrne@northgate.test` | Northgate 9S1 Science and 10M2 Maths, with pupil names |
| Teacher | `c.doyle@northgate.test` | Northgate 8E3 English |
| School admin | `admin@riverside.test` | Riverside College |
| Teacher | `g.kerr@riverside.test` | Riverside 9X Science |
| School admin | `admin@hillcrest.test` | Hillcrest Academy (no classes yet) |
| Authority admin | `admin@other-authority.test` | A second authority, for isolation testing |
| School admin / teacher | `admin@other-school.test`, `teacher@other-school.test` | The second authority's school |
| Disabled teacher | `former.teacher@northgate.test` | Cannot sign in |

The fuller demo dataset (about 20 classes, several hundred submissions, six weeks of history) comes in build step 7.

## Tests

```sh
npm run typecheck
npm test            # Vitest: unit + integration against Postgres (resets the redpen_test database)
npm run build && npm run test:e2e   # Playwright against a production build (resets redpen_e2e)
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
| School admin | Every class in their school with pupil codes (not names), staff, the school's audit log. Can create classes and share them with teachers. No pupil work or marks. |
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
