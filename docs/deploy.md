# Deploying Red Pen (Fly.io, London)

This is the demo deployment: a public HTTPS link where all three roles can be shown with invented data. The last section lists what must change before any real pupil data.

Fly.io commands and settings here were checked against Fly's documentation (github.com/superfly/docs, 16 October 2026). They have not yet been run against a real Fly account from this repository; the first setup run is that test.

## What runs where

| Part | Fly app | Where | Notes |
| --- | --- | --- | --- |
| Web app, marking worker, hourly retention job | `redpen-demo` (`fly.toml`) | London (`lhr`), one always-on Machine | HTTPS at `https://<app>.fly.dev`. Auto-stop is off, because Fly's auto-stop ignores background work like the marking queue. |
| Photos of pupil work | volume `redpen_photos` on the web app | London | Encrypted at rest; daily snapshots kept 14 days. Not Fly's object storage (Tigris), which replicates worldwide. |
| PostgreSQL 16 | `redpen-db` (`deploy/db/fly.toml`) | London, private network only | Our own Postgres on the official image, so the two-role row-level security model works unchanged. No public IP; the app reaches it at `redpen-db.internal:5432`. |
| AI marking | none (demo mode) | – | `MARKING_MODE=demo`: built-in example results, nothing leaves Fly. |

## First-time setup (about 15 minutes)

1. **Fly.io account.** Sign up at fly.io (it asks for a card). Note your organisation slug: usually `personal`.
2. **Deploy token.** With the Fly CLI on your own computer: `fly auth login`, then `fly tokens create org` (or create one in the Fly dashboard). Copy all of it, including the `FlyV1 ` prefix.
3. **GitHub secret.** In the repository: Settings → Secrets and variables → Actions → New repository secret: `FLY_API_TOKEN`, paste the token.
4. **Run the setup.** Actions → **Fly.io first-time setup** → Run workflow. The defaults are `redpen-demo`, `redpen-db`, `personal` and `lhr`. App names are global on Fly; if `redpen-demo` is taken, choose another, and set it in step 5.
   - The workflow creates both apps and their volumes in London.
   - It generates every secret (database passwords, session secret, pupil-name encryption key, file-link secret) on the runner and sends them straight to Fly. Nothing is printed or stored in GitHub.
   - It deploys the database, then the app. The app migrates the database as its release step and seeds the demo data on first start.
   - It waits until `https://<app>.fly.dev/api/health` reports ok.
5. **Repository variables** (Settings → Secrets and variables → Actions → Variables):
   - `PUBLIC_URL` = `https://<app>.fly.dev`. This switches on the uptime check.
   - `FLY_APP` = your app name, only if it is not `redpen-demo`.
6. **Try it.** Open the link and sign in with the demo logins in the README (password `redpen-demo-2026`).

The script is safe to re-run: it skips whatever already exists and never replaces secrets that are set. You can also run it locally: `APP=redpen-demo DB_APP=redpen-db REGION=lhr ORG=personal deploy/fly-setup.sh` after `fly auth login`.

## Deploying changes

Automatic. When CI passes on `main`, the **Deploy** workflow deploys the web app (`flyctl deploy --remote-only`). Migrations run first as Fly's release command; if they fail, the old version keeps running. The workflow then checks the live health endpoint. You can also run **Deploy** by hand from the Actions tab.

The database app changes rarely; deploy it by hand: `fly deploy deploy/db --config deploy/db/fly.toml -a redpen-db --ha=false --no-public-ips`.

## Before a demo

Actions → **Reset demo data** → type `RESET` → Run. It replaces everything with a fresh demo dataset dated to today (about 30 seconds), then restarts the app. The app refuses a reset unless `ALLOW_DEMO_SEED=true`, which only the demo deployment sets. Then follow `docs/demo-script.md`.

## Configuration

Non-secret settings are in `[env]` in `fly.toml`: demo mode, storage, the trusted client-IP header (`fly-client-ip`), hosting facts shown in the trust centre, and backup retention. Secrets are set by the setup script and listed with `fly secrets list -a <app>` (values are never shown):

| Secret | What |
| --- | --- |
| `DATABASE_URL` | `redpen_app` (row-level security applies) at `redpen-db.internal` |
| `DATABASE_ADMIN_URL` | `redpen_owner`, for migrations and the demo reset |
| `AUTH_SECRET`, `FILE_URL_SECRET` | Session signing, photo link signing |
| `PUPIL_NAME_KEY` | Encrypts pupil names. Losing it makes stored names unreadable. |
| `AUTH_URL` | `https://<app>.fly.dev`; change it if you add a custom domain |
| On `redpen-db`: `POSTGRES_PASSWORD`, `OWNER_PASSWORD`, `APP_PASSWORD` | Used once, when the database volume is first initialised |

To fill in the company details the trust centre shows as "To be confirmed" (company name, ICO registration and so on), add them to `[env]` in `fly.toml` (they are not secret) and push, or set them with `fly secrets set`. The names are in `.env.example`.

## Custom domain

`fly certs add demo.example.co.uk -a redpen-demo`, add the DNS records it prints, then `fly secrets set AUTH_URL=https://demo.example.co.uk -a redpen-demo` and update the `PUBLIC_URL` variable.

## Backups and restore

Two layers.

1. **Daily volume snapshots, kept 14 days**, for both the database and photo volumes. Fly takes them automatically and encrypts them. List them with `fly volumes list -a redpen-db`, then `fly volumes snapshots list <volume id>`. To restore, create a new volume from a snapshot (`fly volumes create redpen_pgdata --snapshot-id <id> -a redpen-db -r lhr -s 3`) and move the database Machine onto it (stop the Machine, destroy the old volume or Machine, `fly deploy` the database app again). Fly's documentation does not say where snapshots are stored; see `docs/claims.md`.
2. **Logical backups**, which you can keep and restore anywhere:
   ```sh
   fly ssh console -a redpen-demo -C "printenv DATABASE_ADMIN_URL"   # note the owner password
   fly proxy 15432:5432 -a redpen-db                                  # in a second terminal
   DATABASE_ADMIN_URL=postgres://redpen_owner:<password>@localhost:15432/redpen scripts/db-backup.sh redpen.dump
   ```
   Restore into an empty database with `scripts/db-restore.sh`, then check it with `scripts/verify-restore.ts`. It compares every table row for row with the source, and checks that row-level security, the lock triggers and the append-only audit log came back.

**The restore is tested on every push.** CI starts the production image, lets it seed itself, backs the database up, restores it into a new database, and runs the verification. Practise a snapshot restore on Fly once before the pilot; it has not been tried yet.

Backups contain pupil work. Once real data is in use, keep logical backups encrypted, in the UK or EU, and delete them on the same schedule as the data.

## Monitoring

- Fly checks `/api/health`, which also checks the database, every 30 seconds. A failing check stops traffic going to the Machine, but Fly does **not** restart it automatically. Restart it yourself: `fly apps restart redpen-demo`.
- The **Uptime** workflow checks the public link from outside every 15 minutes: health, HTTPS, the security headers. GitHub emails you when it fails.
- Logs: `fly logs -a redpen-demo`. Marking logs carry ids, counts and timings only, never pupil work.

## Before real pupil data (not done in this step)

- **AI.** Move marking to the EU route (Claude on Amazon Bedrock), set `MARKING_MODE=claude`, and remove the demo settings (`ALLOW_DEMO_SEED`, `SEED_DEMO_IF_EMPTY`). See `docs/later.md`.
- **Database.** One Machine and one volume, with no automatic failover. Move to a managed Postgres in London with automatic failover and point-in-time recovery. Fly Managed Postgres first needs a check that a non-superuser app role is still held by row-level security. Or run a replica.
- **Backups.** Confirm with Fly where snapshots are stored, or keep encrypted logical backups in UK or EU storage you control. Run and record a restore drill.
- **Paperwork.** Sign Fly's data processing agreement, and add Fly to the sub-processor list with its role confirmed.
- **Security.** Get a penetration test, then work towards Cyber Essentials Plus.
