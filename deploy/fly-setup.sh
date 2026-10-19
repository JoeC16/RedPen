#!/usr/bin/env bash
# First-time setup of Red Pen on Fly.io: the database app and the web app, in
# one region, with generated secrets. Safe to re-run: it skips whatever exists.
# Run by .github/workflows/fly-setup.yml, or locally after `fly auth login`:
#   APP=redpen-demo DB_APP=redpen-db REGION=lhr ORG=personal deploy/fly-setup.sh
# Secrets are generated here and sent straight to Fly; they are never printed.
set -euo pipefail
: "${APP:?}" "${DB_APP:?}" "${REGION:?}" "${ORG:?}"
fly() { flyctl "$@"; }
rand() { openssl rand -hex 24; }
b64() { openssl rand -base64 32; }

app_exists() { fly status -a "$1" >/dev/null 2>&1; }
has_volume() { fly volumes list -a "$1" --json | grep -qi "\"name\": *\"$2\""; }
has_secret() { fly secrets list -a "$1" --json | grep -q "\"$2\""; }

echo "== Apps"
app_exists "$DB_APP" || fly apps create "$DB_APP" --org "$ORG"
app_exists "$APP" || fly apps create "$APP" --org "$ORG"

echo "== Volumes ($REGION)"
has_volume "$DB_APP" redpen_pgdata || fly volumes create redpen_pgdata -a "$DB_APP" -r "$REGION" -s 3 --snapshot-retention 14 -y
has_volume "$APP" redpen_photos || fly volumes create redpen_photos -a "$APP" -r "$REGION" -s 1 --snapshot-retention 14 -y

echo "== Secrets"
if has_secret "$DB_APP" OWNER_PASSWORD; then
  echo "database secrets already set; leaving them"
else
  owner_pw=$(rand); app_pw=$(rand)
  printf 'POSTGRES_PASSWORD=%s\nOWNER_PASSWORD=%s\nAPP_PASSWORD=%s\n' "$(rand)" "$owner_pw" "$app_pw" | fly secrets import -a "$DB_APP" --stage
  db="$DB_APP.internal:5432/redpen"
  printf 'DATABASE_URL=%s\nDATABASE_ADMIN_URL=%s\nAUTH_SECRET=%s\nPUPIL_NAME_KEY=%s\nFILE_URL_SECRET=%s\nAUTH_URL=%s\n' \
    "postgres://redpen_app:$app_pw@$db" "postgres://redpen_owner:$owner_pw@$db" "$(b64)" "$(b64)" "$(b64)" "https://$APP.fly.dev" \
    | fly secrets import -a "$APP" --stage
fi

echo "== Database (private network only)"
fly deploy deploy/db --config deploy/db/fly.toml -a "$DB_APP" --ha=false --no-public-ips --remote-only -y

echo "== Web app"
fly deploy . --config fly.toml -a "$APP" --ha=false --remote-only -y

echo "== Check"
for i in $(seq 1 30); do
  if curl -sf "https://$APP.fly.dev/api/health" | grep -q '"ok"'; then
    echo "Live: https://$APP.fly.dev"
    exit 0
  fi
  sleep 10
done
echo "The app did not report healthy within 5 minutes. Run: fly logs -a $APP" >&2
exit 1
