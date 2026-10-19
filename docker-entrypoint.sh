#!/bin/sh
set -e
# Started as root only to prepare a mounted volume (Fly mounts them root-owned);
# everything else runs as the unprivileged app user.
if [ "$(id -u)" = "0" ]; then
  if [ "$STORAGE_DRIVER" = "local" ] && [ -n "$STORAGE_LOCAL_DIR" ]; then
    mkdir -p "$STORAGE_LOCAL_DIR" 2>/dev/null && chown app:app "$STORAGE_LOCAL_DIR" || true
  fi
  exec setpriv --reuid=app --regid=app --init-groups "$0" "$@"
fi
# Start-up steps only when starting the server (the default command). Any other
# command, such as Fly's release_command "node scripts/migrate.ts", just runs.
if [ "$1" = "node" ] && [ "$2" = "server.js" ]; then
  if [ "$RUN_MIGRATIONS_ON_START" = "true" ]; then
    node scripts/migrate.ts
  fi
  # A demo deployment seeds itself the first time it starts against an empty database.
  if [ "$ALLOW_DEMO_SEED" = "true" ] && [ "$SEED_DEMO_IF_EMPTY" = "true" ]; then
    node scripts/demo-reset.mjs --if-empty
  fi
fi
exec "$@"
