# Progress

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
