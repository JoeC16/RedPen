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
