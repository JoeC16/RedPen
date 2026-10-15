-- 0001 foundation: tenancy hierarchy, users, classes, pupils, audit log, login attempts.
--
-- Runs as the schema owner (DATABASE_ADMIN_URL). The application connects as
-- the separate role `redpen_app`, which is NOT the table owner, so every
-- row-level security policy below applies to it. See db/bootstrap.sql.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Tenancy context. The data-access layer sets these per transaction with
-- set_config(..., true). Missing or empty settings read as NULL, which matches
-- no rows, so a forgotten context fails closed.
-- ---------------------------------------------------------------------------
create function app_user_id() returns uuid
  language sql stable
  as $$ select nullif(current_setting('app.user_id', true), '')::uuid $$;

create function app_role() returns text
  language sql stable
  as $$ select nullif(current_setting('app.role', true), '') $$;

create function app_school_id() returns uuid
  language sql stable
  as $$ select nullif(current_setting('app.school_id', true), '')::uuid $$;

create function app_authority_id() returns uuid
  language sql stable
  as $$ select nullif(current_setting('app.authority_id', true), '')::uuid $$;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
create table authority (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  retention_days integer not null default 30 check (retention_days between 1 and 3650),
  is_demo boolean not null default false,
  created_at timestamptz not null default now()
);

create table school (
  id uuid primary key default gen_random_uuid(),
  authority_id uuid not null references authority(id) on delete restrict,
  name text not null,
  created_at timestamptz not null default now(),
  unique (id, authority_id)
);
create index school_authority_idx on school(authority_id);

create type user_role as enum ('authority_admin', 'school_admin', 'teacher');

-- `user` is a reserved word in Postgres, so the table is app_user.
create table app_user (
  id uuid primary key default gen_random_uuid(),
  authority_id uuid not null references authority(id) on delete restrict,
  school_id uuid,
  email text not null,
  display_name text not null,
  role user_role not null,
  password_hash text,
  disabled_at timestamptz,
  created_at timestamptz not null default now(),
  -- the school must belong to the same authority
  foreign key (school_id, authority_id) references school(id, authority_id) on delete restrict,
  -- authority admins have no school; everyone else must have one
  check ((role = 'authority_admin') = (school_id is null)),
  unique (id, school_id)
);
create unique index app_user_email_idx on app_user (lower(email));
create index app_user_school_idx on app_user(school_id);

create table class (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references school(id) on delete restrict,
  name text not null,
  year_group smallint not null check (year_group between 1 and 14),
  subject text not null,
  created_at timestamptz not null default now(),
  unique (id, school_id)
);
create index class_school_idx on class(school_id);

-- school_id is repeated so composite keys guarantee teacher and class share a school.
create table class_teacher (
  class_id uuid not null,
  user_id uuid not null,
  school_id uuid not null,
  primary key (class_id, user_id),
  foreign key (class_id, school_id) references class(id, school_id) on delete cascade,
  foreign key (user_id, school_id) references app_user(id, school_id) on delete cascade
);
create index class_teacher_user_idx on class_teacher(user_id);

-- Pupils are pseudonymous. display_name_enc is AES-256-GCM ciphertext produced
-- by the application (src/server/crypto.ts); the database never sees the key.
create table pupil (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null,
  school_id uuid not null,
  code text not null check (code ~ '^[A-Za-z0-9_-]{1,32}$'),
  display_name_enc text,
  created_at timestamptz not null default now(),
  foreign key (class_id, school_id) references class(id, school_id) on delete cascade,
  unique (school_id, code)
);
create index pupil_class_idx on pupil(class_id);

create table audit_event (
  id bigint generated always as identity primary key,
  actor_id uuid references app_user(id) on delete set null,
  authority_id uuid references authority(id) on delete restrict,
  school_id uuid,
  action text not null check (action ~ '^[a-z_]+(\.[a-z_]+)+$'),
  target_type text,
  target_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  foreign key (school_id, authority_id) references school(id, authority_id) on delete restrict
);
create index audit_event_scope_idx on audit_event(authority_id, school_id, created_at desc);
create index audit_event_actor_idx on audit_event(actor_id, created_at desc);
create index audit_event_action_idx on audit_event(action, created_at desc);

-- Append-only, enforced for every role including the owner.
create function audit_event_append_only() returns trigger
  language plpgsql
  as $$ begin raise exception 'audit_event is append-only'; end $$;

create trigger audit_event_no_update before update or delete on audit_event
  for each row execute function audit_event_append_only();
create trigger audit_event_no_truncate before truncate on audit_event
  for each statement execute function audit_event_append_only();

-- Login attempts for rate limiting. Keys are SHA-256 hashes, never raw emails or IPs.
create table login_attempt (
  id bigint generated always as identity primary key,
  email_key text not null,
  ip_key text not null,
  succeeded boolean not null,
  created_at timestamptz not null default now()
);
create index login_attempt_email_idx on login_attempt(email_key, created_at);
create index login_attempt_ip_idx on login_attempt(ip_key, created_at);

-- ---------------------------------------------------------------------------
-- Security-definer helpers. These run as the owner and bypass RLS, so each one
-- is narrow and returns only what its caller needs.
-- ---------------------------------------------------------------------------

-- Is the current user assigned to this class? Used inside the class policy;
-- a plain subquery on class_teacher would make the policies recursive.
create function app_teaches_class(p_class_id uuid) returns boolean
  language sql stable security definer set search_path = public, pg_temp
  as $$
    select exists (
      select 1 from class_teacher
      where class_id = p_class_id and user_id = app_user_id()
    )
  $$;

-- Sign-in lookup, before any tenancy context exists.
create function auth_find_user_by_email(p_email text)
  returns table (id uuid, role user_role, school_id uuid, authority_id uuid,
                 password_hash text, disabled_at timestamptz)
  language sql stable security definer set search_path = public, pg_temp
  as $$
    select id, role, school_id, authority_id, password_hash, disabled_at
    from app_user where lower(email) = lower(p_email)
  $$;

-- Resolve a session's user id to a fresh tenancy context on every request, so
-- role changes and disabling take effect immediately.
create function auth_session_user(p_user_id uuid)
  returns table (id uuid, email text, display_name text, role user_role,
                 school_id uuid, authority_id uuid, disabled_at timestamptz)
  language sql stable security definer set search_path = public, pg_temp
  as $$
    select id, email, display_name, role, school_id, authority_id, disabled_at
    from app_user where id = p_user_id
  $$;

-- Authentication events happen outside a tenancy context; attribute them to
-- the user's own school and authority so their admins can see them. The user
-- is the actor only for a successful sign-in or sign-out; for a failed or
-- blocked attempt we do not know who tried, so the account is the target only.
create function audit_auth_event(p_action text, p_user_id uuid, p_metadata jsonb)
  returns void
  language sql volatile security definer set search_path = public, pg_temp
  as $$
    insert into audit_event (actor_id, authority_id, school_id, action, target_type, target_id, metadata)
    select case when p_action in ('auth.login', 'auth.logout') then u.id end, u.authority_id, u.school_id, p_action, 'user', u.id::text, coalesce(p_metadata, '{}'::jsonb)
    from app_user u where u.id = p_user_id
    union all
    select null, null, null, p_action, null, null, coalesce(p_metadata, '{}'::jsonb)
    where p_user_id is null
  $$;

-- ---------------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------------
alter table authority enable row level security;
alter table school enable row level security;
alter table app_user enable row level security;
alter table class enable row level security;
alter table class_teacher enable row level security;
alter table pupil enable row level security;
alter table audit_event enable row level security;

create policy authority_read on authority for select
  using (id = app_authority_id());
create policy authority_update on authority for update
  using (id = app_authority_id() and app_role() = 'authority_admin')
  with check (id = app_authority_id());

create policy school_read on school for select
  using (authority_id = app_authority_id()
         and (app_role() = 'authority_admin' or id = app_school_id()));
create policy school_write on school for all
  using (authority_id = app_authority_id() and app_role() = 'authority_admin')
  with check (authority_id = app_authority_id() and app_role() = 'authority_admin');

create policy user_read on app_user for select
  using (authority_id = app_authority_id()
         and (app_role() = 'authority_admin' or school_id = app_school_id()));
create policy user_write on app_user for all
  using (authority_id = app_authority_id()
         and (app_role() = 'authority_admin'
              or (app_role() = 'school_admin' and school_id = app_school_id())))
  with check (authority_id = app_authority_id()
              and (app_role() = 'authority_admin'
                   or (app_role() = 'school_admin' and school_id = app_school_id()
                       and role <> 'authority_admin')));

-- Authority admins have no row access to classes or pupils. Their dashboards
-- (build step 5) read aggregates through dedicated functions.
create policy class_read on class for select
  using (school_id = app_school_id()
         and (app_role() = 'school_admin'
              or (app_role() = 'teacher' and app_teaches_class(id))));
create policy class_write on class for all
  using (school_id = app_school_id() and app_role() = 'school_admin')
  with check (school_id = app_school_id() and app_role() = 'school_admin');

create policy class_teacher_read on class_teacher for select
  using (school_id = app_school_id()
         and exists (select 1 from class c where c.id = class_teacher.class_id));
create policy class_teacher_write on class_teacher for all
  using (school_id = app_school_id() and app_role() = 'school_admin')
  with check (school_id = app_school_id() and app_role() = 'school_admin');

create policy pupil_access on pupil for all
  using (school_id = app_school_id()
         and exists (select 1 from class c where c.id = pupil.class_id))
  with check (school_id = app_school_id()
              and exists (select 1 from class c where c.id = pupil.class_id));

create policy audit_read on audit_event for select
  using (authority_id = app_authority_id()
         and (app_role() = 'authority_admin'
              or (app_role() = 'school_admin' and school_id = app_school_id())));
create policy audit_insert on audit_event for insert
  with check (actor_id = app_user_id()
              and authority_id = app_authority_id()
              and (school_id is not distinct from app_school_id()
                   or app_role() = 'authority_admin'));

-- ---------------------------------------------------------------------------
-- Grants for the application role
-- ---------------------------------------------------------------------------
grant usage on schema public to redpen_app;
grant select, update on authority to redpen_app;
grant select, insert, update, delete on school, app_user, class, class_teacher, pupil to redpen_app;
grant select, insert on audit_event to redpen_app;
grant select, insert, delete on login_attempt to redpen_app;

revoke execute on function app_teaches_class(uuid), auth_find_user_by_email(text),
  auth_session_user(uuid), audit_auth_event(text, uuid, jsonb) from public;
grant execute on function app_teaches_class(uuid), auth_find_user_by_email(text),
  auth_session_user(uuid), audit_auth_event(text, uuid, jsonb) to redpen_app;
