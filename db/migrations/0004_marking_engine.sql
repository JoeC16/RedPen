-- 0004 marking engine: AI run metadata, failure reasons, rate limiting, and
-- the name list used for redaction.

-- Why a submission's marking failed, in words the teacher can act on.
alter table submission add column failure_reason text check (length(failure_reason) <= 500);

-- The queue job that produced a run, so a retried job never writes twice.
alter table mark_result add column job_id text unique;
alter table mark_result add column cache_read_tokens integer;

-- The AI's one-sentence reason for each line, kept apart from the teacher's own note.
alter table mark_line add column ai_comment text check (length(ai_comment) <= 1000);

-- One row per script sent for marking, for per-teacher and per-school limits.
create table marking_request (
  id bigint generated always as identity primary key,
  school_id uuid not null references school(id) on delete cascade,
  user_id uuid not null references app_user(id) on delete cascade,
  submission_id uuid not null,
  created_at timestamptz not null default now()
);
create index marking_request_school_idx on marking_request(school_id, created_at);
create index marking_request_user_idx on marking_request(user_id, created_at);

alter table marking_request enable row level security;
create policy marking_request_own on marking_request for all
  using (school_id = app_school_id() and user_id = app_user_id())
  with check (school_id = app_school_id() and user_id = app_user_id() and app_role() = 'teacher');
grant select, insert on marking_request to redpen_app;

-- Counts for the rate limit. The school count covers every teacher, which
-- row-level security would otherwise hide from the caller.
create function app_marking_counts(p_since timestamptz)
  returns table (mine integer, school integer)
  language sql stable security definer set search_path = public, pg_temp
  as $$
    select count(*) filter (where user_id = app_user_id())::int,
           count(*)::int
    from marking_request
    where school_id = app_school_id() and created_at >= p_since
  $$;

-- Every pupil name (still encrypted) and staff name in the caller's school, so
-- redaction can remove any of them from work before it is sent to the model.
-- Names are decrypted in the application only for this purpose and never stored.
create function app_school_name_list()
  returns table (kind text, value text)
  language sql stable security definer set search_path = public, pg_temp
  as $$
    select 'pupil_enc', display_name_enc from pupil
      where school_id = app_school_id() and display_name_enc is not null
    union all
    select 'staff', display_name from app_user
      where school_id = app_school_id()
  $$;

revoke execute on function app_marking_counts(timestamptz), app_school_name_list() from public;
grant execute on function app_marking_counts(timestamptz), app_school_name_list() to redpen_app;

-- pg-boss keeps its queue tables in its own schema, which it creates and
-- migrates itself as the app role. Those tables hold job ids only, no pupil content.
do $$ begin
  execute format('grant create on database %I to redpen_app', current_database());
end $$;
