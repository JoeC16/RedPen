#!/bin/sh
set -e
if [ "$RUN_MIGRATIONS_ON_START" = "true" ]; then
  node scripts/migrate.ts
fi
# A demo deployment seeds itself the first time it starts against an empty database.
if [ "$ALLOW_DEMO_SEED" = "true" ] && [ "$SEED_DEMO_IF_EMPTY" = "true" ]; then
  node scripts/demo-reset.mjs --if-empty
fi
exec node server.js
