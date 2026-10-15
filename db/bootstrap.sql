-- One-off bootstrap for LOCAL DEVELOPMENT and CI, run as a Postgres superuser.
-- Creates the two roles the app uses and the dev/test databases.
--
--   redpen_owner  owns the schema; runs migrations and seeds (DATABASE_ADMIN_URL)
--   redpen_app    what the running app connects as (DATABASE_URL). It does not
--                 own any table and has no BYPASSRLS, so row-level security applies.
--
-- The passwords here are for local use only. Production roles are created with
-- generated passwords held in the host's secret store (see docs at build step 8).

create role redpen_owner login password 'redpen_owner_dev' createdb;
create role redpen_app login password 'redpen_app_dev' nobypassrls;

create database redpen owner redpen_owner;
create database redpen_test owner redpen_owner;
create database redpen_e2e owner redpen_owner;
