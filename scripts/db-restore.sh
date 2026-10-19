#!/bin/sh
# Restore a backup made by db-backup.sh into an EMPTY database, as the schema owner.
#   DATABASE_ADMIN_URL=postgres://.../redpen_restored scripts/db-restore.sh backup.dump
# The roles redpen_owner and redpen_app must already exist on the server.
# Then check it: DATABASE_ADMIN_URL=<source> RESTORED_ADMIN_URL=<restored> npx tsx scripts/verify-restore.ts
set -eu
in="${1:?usage: db-restore.sh <file.dump>}"
pg_restore --exit-on-error --single-transaction --dbname="${DATABASE_ADMIN_URL:?DATABASE_ADMIN_URL is not set}" "$in"
echo "restored from $in"
