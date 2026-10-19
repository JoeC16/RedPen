#!/bin/sh
# Runs once, when the data volume is first initialised. Production equivalent
# of db/bootstrap.sql, with passwords from Fly secrets instead of dev values:
#   redpen_owner  owns the schema; migrations and seeding (DATABASE_ADMIN_URL)
#   redpen_app    what the app connects as; no BYPASSRLS, so row-level security applies
set -eu
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname postgres \
  -v owner_pw="${OWNER_PASSWORD:?OWNER_PASSWORD secret is not set}" \
  -v app_pw="${APP_PASSWORD:?APP_PASSWORD secret is not set}" <<'SQL'
create role redpen_owner login password :'owner_pw' createdb;
create role redpen_app login password :'app_pw' nobypassrls;
create database redpen owner redpen_owner;
SQL
