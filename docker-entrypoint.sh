#!/bin/sh
set -e
if [ "$RUN_MIGRATIONS_ON_START" = "true" ]; then
  node scripts/migrate.ts
fi
exec node server.js
