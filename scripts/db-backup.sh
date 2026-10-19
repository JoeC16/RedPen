#!/bin/sh
# Logical backup of the Red Pen database, as the schema owner.
#   DATABASE_ADMIN_URL=postgres://... scripts/db-backup.sh backup.dump
# The pg-boss job queue (schema pgboss) is left out: it holds only job ids, and
# the app recreates it on start. Roles are cluster-level and are not in the
# dump; create them first on a new server (db/bootstrap.sql, with real passwords).
# The dump holds pupil work: keep it encrypted, in the UK or EU, and delete it on
# the same schedule as the data it contains.
set -eu
out="${1:?usage: db-backup.sh <file.dump>}"
pg_dump --format=custom --exclude-schema=pgboss --no-comments --file="$out" "${DATABASE_ADMIN_URL:?DATABASE_ADMIN_URL is not set}"
echo "backup written to $out"
