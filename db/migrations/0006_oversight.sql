-- 0006 oversight: retention and deletion, two-admin school deletion, and the
-- aggregate figures behind the school and authority dashboards.
--
-- Founder decisions 2026-10-18:
-- * Retention deletes pupil work, photos, transcriptions, evidence quotes and
--   feedback text, and keeps the numbers (marks, timestamps, AI-versus-teacher
--   figures) linked only to the pseudonymous pupil code.
-- * "Delete everything for this school" needs two different admins: one
--   requests, another confirms within 24 hours. Either may be a school admin
--   of that school or an authority admin.
-- * Dashboards suppress figures built from fewer than 5 pupils or scripts
--   (done in the application, which sees only these aggregates).

-- ---------------------------------------------------------------------------
-- Settings
-- ---------------------------------------------------------------------------
-- Minutes a teacher would spend marking one script by hand, per work type.
-- Shown next to the time-saved estimate and editable by the authority admin.
alter table authority add column time_saved_minutes jsonb not null
  default '{"short": 3, "maths": 4, "essay": 8}'::jsonb
  check (jsonb_typeof(time_saved_minutes) = 'object');

-- ---------------------------------------------------------------------------
-- Content deletion keeps the numbers
-- ---------------------------------------------------------------------------
alter table submission add column content_deleted_at timestamptz;
alter table submission add constraint submission_content_deleted_check
  check (content_deleted_at is null or (status = 'approved' and text is null and feedback is null));
create index submission_due_idx on submission(delete_after)
  where content_deleted_at is null and delete_after is not null;

create function submission_content_deleted(p_submission_id uuid) returns boolean
  language sql stable security definer set search_path = public, pg_temp
  as $$ select exists (select 1 from submission where id = p_submission_id and content_deleted_at is not null) $$;

-- Approved work stays locked, except that its content may be removed once
-- content_deleted_at is set, and deleted work can never be brought back or
-- reopened (there is nothing left to re-mark from).
create or replace function submission_lock() returns trigger
  language plpgsql
  as $$
  begin
    if old.content_deleted_at is not null and new.content_deleted_at is distinct from old.content_deleted_at then
      raise exception 'the work was deleted; this cannot be undone';
    end if;
    if old.status = 'approved' and new.status = 'approved' and (
         new.absent is distinct from old.absent or new.assignment_id is distinct from old.assignment_id
         or new.pupil_id is distinct from old.pupil_id
         or ((new.text is distinct from old.text or new.feedback is distinct from old.feedback)
             and not (new.content_deleted_at is not null and new.text is null and new.feedback is null))) then
      raise exception 'submission is approved; reopen it before changing it';
    end if;
    return new;
  end $$;

create or replace function mark_line_lock() returns trigger
  language plpgsql
  as $$
  declare sid uuid;
  begin
    select submission_id into sid from mark_result where id = coalesce(new.mark_result_id, old.mark_result_id);
    if submission_is_approved(sid) then
      -- Removing the quotes and comments from deleted work; the marks stay as they are.
      if tg_op = 'UPDATE' and submission_content_deleted(sid)
         and new.evidence is null and new.comment is null and new.ai_comment is null
         and (new.mark_result_id, new.position, new.label, new.max, new.ai_awarded, new.final_awarded)
             is not distinct from (old.mark_result_id, old.position, old.label, old.max, old.ai_awarded, old.final_awarded) then
        return new;
      end if;
      raise exception 'marks are locked by approval; reopen the submission first';
    end if;
    return coalesce(new, old);
  end $$;

create or replace function submission_file_lock() returns trigger
  language plpgsql
  as $$
  declare sid uuid := coalesce(new.submission_id, old.submission_id);
  begin
    if tg_op = 'DELETE' and submission_content_deleted(sid) then
      return old;
    end if;
    if submission_is_approved(sid) then
      raise exception 'submission is approved; reopen it before changing its photos';
    end if;
    return coalesce(new, old);
  end $$;

-- Stored objects (photos) whose rows are gone and whose bytes must be deleted
-- from object storage. Filled in the same transaction that removes the rows,
-- drained by the worker afterwards, so a storage outage delays deletion but
-- never loses track of a file.
create table pending_object_deletion (
  storage_key text primary key,
  school_id uuid not null references school(id) on delete cascade,
  attempts integer not null default 0,
  created_at timestamptz not null default now()
);
alter table pending_object_deletion enable row level security;
create policy pending_object_deletion_queue on pending_object_deletion for insert
  with check (school_id = app_school_id());
grant insert on pending_object_deletion to redpen_app;

-- Remove one approved submission's content and keep its numbers. Runs with
-- the caller's rights: a teacher's row-level security applies, and the
-- retention job calls it from a security-definer function.
create function scrub_submission_content(p_submission_id uuid) returns integer
  language plpgsql volatile
  as $$
  declare files integer;
  begin
    update submission set content_deleted_at = now(), text = null, feedback = null, failure_reason = null
      where id = p_submission_id and status = 'approved' and content_deleted_at is null;
    if not found then
      return null;
    end if;
    update mark_result
      set transcription = null, feedback_draft = null,
          -- flags can quote the work; keep how many there were, not what they said
          flags = coalesce((select jsonb_agg('removed'::text) from jsonb_array_elements(flags)), '[]'::jsonb)
      where submission_id = p_submission_id;
    update mark_line set evidence = null, comment = null, ai_comment = null
      where mark_result_id in (select id from mark_result where submission_id = p_submission_id);
    update approval set final_feedback = null where submission_id = p_submission_id;
    insert into pending_object_deletion (storage_key, school_id)
      select storage_key, school_id from submission_file where submission_id = p_submission_id
      on conflict do nothing;
    delete from submission_file where submission_id = p_submission_id;
    get diagnostics files = row_count;
    return files;
  end $$;
revoke execute on function scrub_submission_content(uuid) from public;
grant execute on function scrub_submission_content(uuid) to redpen_app;

-- The scheduled retention job: every school, no tenancy context. Deletes the
-- content of approved work whose delete_after has passed, oldest first, and
-- writes one audit event per school per run.
create function app_run_retention(p_limit integer)
  returns table (school_id uuid, submissions integer, files integer)
  language plpgsql volatile security definer set search_path = public, pg_temp
  as $$
  #variable_conflict use_column
  declare r record;
  begin
    create temp table if not exists retention_run (school_id uuid, files integer) on commit drop;
    for r in
      select s.id, s.school_id from submission s
      where s.delete_after <= now() and s.content_deleted_at is null and s.status = 'approved'
      order by s.delete_after
      limit p_limit
      for update skip locked
    loop
      insert into retention_run values (r.school_id, coalesce(scrub_submission_content(r.id), 0));
    end loop;
    return query
      with done as (
        select rr.school_id, count(*)::int as submissions, sum(rr.files)::int as files from retention_run rr group by rr.school_id
      ), logged as (
        insert into audit_event (actor_id, authority_id, school_id, action, target_type, target_id, metadata)
        select null, sc.authority_id, d.school_id, 'retention.deleted', 'school', d.school_id::text,
               jsonb_build_object('submissions', d.submissions, 'photos', d.files)
        from done d join school sc on sc.id = d.school_id
      )
      select d.school_id, d.submissions, d.files from done d;
    drop table retention_run;
  end $$;

-- Draining the storage deletion queue (worker only).
create function app_pending_object_keys(p_limit integer) returns table (storage_key text)
  language sql volatile security definer set search_path = public, pg_temp
  as $$
    update pending_object_deletion set attempts = attempts + 1
    where storage_key in (select p.storage_key from pending_object_deletion p order by p.created_at limit p_limit for update skip locked)
    returning storage_key
  $$;
create function app_forget_object_keys(p_keys text[]) returns integer
  language sql volatile security definer set search_path = public, pg_temp
  as $$
    with gone as (delete from pending_object_deletion where storage_key = any(p_keys) returning 1)
    select count(*)::int from gone
  $$;

-- Changing the retention period reschedules approved work that still has its
-- content, so the new policy applies to everything, not just new approvals.
create function app_set_retention(p_days integer) returns integer
  language plpgsql volatile security definer set search_path = public, pg_temp
  as $$
  declare old_days integer; moved integer;
  begin
    if app_role() is distinct from 'authority_admin' then
      raise exception 'only an authority admin can set retention' using errcode = '42501';
    end if;
    select retention_days into old_days from authority where id = app_authority_id() for update;
    update authority set retention_days = p_days where id = app_authority_id();
    update submission s set delete_after = a.approved_at + make_interval(days => p_days)
      from approval a, school sc
      where a.submission_id = s.id and a.reopened_at is null
        and sc.id = s.school_id and sc.authority_id = app_authority_id()
        and s.status = 'approved' and s.content_deleted_at is null;
    get diagnostics moved = row_count;
    insert into audit_event (actor_id, authority_id, school_id, action, target_type, target_id, metadata)
      values (app_user_id(), app_authority_id(), null, 'settings.retention_changed', 'authority', app_authority_id()::text,
              jsonb_build_object('from', old_days, 'to', p_days, 'rescheduled', moved));
    return moved;
  end $$;

-- ---------------------------------------------------------------------------
-- Delete everything for a school: two different admins
-- ---------------------------------------------------------------------------
create table school_deletion_request (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null,
  authority_id uuid not null,
  requested_by uuid not null references app_user(id),
  requested_at timestamptz not null default now(),
  expires_at timestamptz not null,
  confirmed_by uuid references app_user(id),
  confirmed_at timestamptz,
  -- cancelled_by is null when the request simply expired
  cancelled_by uuid references app_user(id),
  cancelled_at timestamptz,
  result jsonb,
  foreign key (school_id, authority_id) references school(id, authority_id) on delete cascade,
  check (confirmed_by is null or confirmed_by <> requested_by),
  check (confirmed_at is null or cancelled_at is null)
);
create unique index school_deletion_open_idx on school_deletion_request(school_id)
  where confirmed_at is null and cancelled_at is null;

alter table school_deletion_request enable row level security;
create policy school_deletion_read on school_deletion_request for select
  using (authority_id = app_authority_id()
         and (app_role() = 'authority_admin' or (app_role() = 'school_admin' and school_id = app_school_id())));
grant select on school_deletion_request to redpen_app;

create function app_may_admin_school(p_school_id uuid) returns boolean
  language sql stable security definer set search_path = public, pg_temp
  as $$
    select exists (
      select 1 from school s
      where s.id = p_school_id and s.authority_id = app_authority_id()
        and (app_role() = 'authority_admin' or (app_role() = 'school_admin' and s.id = app_school_id()))
    )
  $$;

create function app_request_school_deletion(p_school_id uuid) returns uuid
  language plpgsql volatile security definer set search_path = public, pg_temp
  as $$
  declare new_id uuid;
  begin
    if not app_may_admin_school(p_school_id) then
      raise exception 'not allowed' using errcode = '42501';
    end if;
    -- An expired request no longer blocks a new one.
    update school_deletion_request set cancelled_at = now()
      where school_id = p_school_id and confirmed_at is null and cancelled_at is null and expires_at <= now();
    insert into school_deletion_request (school_id, authority_id, requested_by, expires_at)
      values (p_school_id, app_authority_id(), app_user_id(), now() + interval '24 hours')
      returning id into new_id;
    insert into audit_event (actor_id, authority_id, school_id, action, target_type, target_id, metadata)
      values (app_user_id(), app_authority_id(), p_school_id, 'school.deletion_requested', 'school', p_school_id::text,
              jsonb_build_object('requestId', new_id));
    return new_id;
  exception when unique_violation then
    raise exception 'a deletion request for this school is already waiting for confirmation' using errcode = 'P0001';
  end $$;

create function app_cancel_school_deletion(p_request_id uuid) returns boolean
  language plpgsql volatile security definer set search_path = public, pg_temp
  as $$
  declare r school_deletion_request;
  begin
    select * into r from school_deletion_request where id = p_request_id for update;
    if r.id is null or not app_may_admin_school(r.school_id) then
      raise exception 'not allowed' using errcode = '42501';
    end if;
    if r.confirmed_at is not null or r.cancelled_at is not null then
      return false;
    end if;
    update school_deletion_request set cancelled_at = now(), cancelled_by = app_user_id() where id = r.id;
    insert into audit_event (actor_id, authority_id, school_id, action, target_type, target_id, metadata)
      values (app_user_id(), r.authority_id, r.school_id, 'school.deletion_cancelled', 'school', r.school_id::text,
              jsonb_build_object('requestId', r.id));
    return true;
  end $$;

-- Deletes every class in the school and, with them, every pupil, assignment,
-- submission, mark, approval and photo record. Keeps the school, its staff
-- accounts and the audit log. Photo bytes are queued for deletion.
create function app_confirm_school_deletion(p_request_id uuid) returns jsonb
  language plpgsql volatile security definer set search_path = public, pg_temp
  as $$
  declare r school_deletion_request; counts jsonb;
  begin
    select * into r from school_deletion_request where id = p_request_id for update;
    if r.id is null or not app_may_admin_school(r.school_id) then
      raise exception 'not allowed' using errcode = '42501';
    end if;
    if r.confirmed_at is not null or r.cancelled_at is not null then
      raise exception 'this request is no longer open' using errcode = 'P0001';
    end if;
    if r.expires_at <= now() then
      raise exception 'this request has expired; ask for a new one' using errcode = 'P0001';
    end if;
    if r.requested_by = app_user_id() then
      raise exception 'a different admin must confirm the deletion' using errcode = 'P0001';
    end if;
    select jsonb_build_object(
      'classes', (select count(*) from class where school_id = r.school_id),
      'pupils', (select count(*) from pupil where school_id = r.school_id),
      'assignments', (select count(*) from assignment where school_id = r.school_id),
      'submissions', (select count(*) from submission where school_id = r.school_id),
      'photos', (select count(*) from submission_file where school_id = r.school_id)
    ) into counts;
    insert into pending_object_deletion (storage_key, school_id)
      select storage_key, school_id from submission_file where school_id = r.school_id
      on conflict do nothing;
    delete from marking_request where school_id = r.school_id;
    delete from class where school_id = r.school_id;
    update school_deletion_request set confirmed_at = now(), confirmed_by = app_user_id(), result = counts where id = r.id;
    insert into audit_event (actor_id, authority_id, school_id, action, target_type, target_id, metadata)
      values (app_user_id(), r.authority_id, r.school_id, 'school.data_deleted', 'school', r.school_id::text,
              counts || jsonb_build_object('requestId', r.id, 'requestedBy', r.requested_by));
    return counts;
  end $$;

-- ---------------------------------------------------------------------------
-- Dashboard aggregates. Admins only, and only counts: no row-level detail ever
-- leaves these functions. Authority admins see every school in their
-- authority; school admins see their own.
-- ---------------------------------------------------------------------------
create function app_oversight_scope(p_school_id uuid) returns table (id uuid)
  language plpgsql stable security definer set search_path = public, pg_temp
  as $$
  #variable_conflict use_column
  begin
    if app_role() = 'authority_admin' then
      return query select s.id from school s where s.authority_id = app_authority_id() and (p_school_id is null or s.id = p_school_id);
    elsif app_role() = 'school_admin' then
      return query select s.id from school s
        where s.id = app_school_id() and s.authority_id = app_authority_id() and (p_school_id is null or s.id = p_school_id);
    else
      raise exception 'dashboards are for school and authority admins' using errcode = '42501';
    end if;
  end $$;

-- One row per (school, work type), per school, per work type and overall
-- (grouping sets; a null key means "all"). A script is a submission with work
-- (typed, photographed or marked) for a pupil who was not absent, counted from
-- when it was added.
create function app_oversight_summary(p_school_id uuid, p_since timestamptz)
  returns table (
    school_id uuid, work_type work_type,
    scripts integer, pupils integer,
    assignments_marked integer, pupils_marked integer, approved integer,
    median_hours_to_approval double precision,
    ai_scripts integer, flagged integer,
    ai_approved integer, kept_unchanged integer, within_one integer,
    ai_runs integer, tokens_in bigint, tokens_out bigint, cache_read_tokens bigint)
  language sql stable security definer set search_path = public, pg_temp
  as $$
    with scope as (select id from app_oversight_scope(p_school_id)),
    s as (
      select sub.id, sub.school_id, a.work_type, sub.pupil_id, sub.assignment_id, sub.created_at
      from submission sub join assignment a on a.id = sub.assignment_id
      where sub.school_id in (select id from scope) and sub.created_at >= p_since and not sub.absent
        and (sub.status <> 'todo' or coalesce(length(sub.text), 0) > 0
             or exists (select 1 from submission_file f where f.submission_id = sub.id))
    ),
    latest_ai as (
      select distinct on (m.submission_id) m.submission_id, jsonb_array_length(m.flags) as flags
      from mark_result m where m.source = 'ai' and m.school_id in (select id from scope)
      order by m.submission_id, m.run_number desc
    ),
    runs as (
      select m.submission_id, count(*) as n, sum(m.tokens_in) as ti, sum(m.tokens_out) as tou, sum(m.cache_read_tokens) as cr
      from mark_result m where m.source = 'ai' and m.school_id in (select id from scope)
      group by m.submission_id
    ),
    j as (
      select s.*, ap.approved_at, ap.final_total, ap.ai_total, ap.lines_changed, la.flags,
             coalesce(r.n, 0) as n, r.ti, r.tou, r.cr
      from s
      left join approval ap on ap.submission_id = s.id and ap.reopened_at is null
      left join latest_ai la on la.submission_id = s.id
      left join runs r on r.submission_id = s.id
    )
    select j.school_id, j.work_type,
           count(*)::int,
           count(distinct j.pupil_id)::int,
           (count(distinct j.assignment_id) filter (where j.approved_at is not null))::int,
           (count(distinct j.pupil_id) filter (where j.approved_at is not null))::int,
           count(j.approved_at)::int,
           percentile_cont(0.5) within group (order by extract(epoch from j.approved_at - j.created_at) / 3600)
             filter (where j.approved_at is not null),
           (count(*) filter (where j.flags is not null))::int,
           (count(*) filter (where j.flags > 0))::int,
           (count(*) filter (where j.approved_at is not null and j.ai_total is not null))::int,
           (count(*) filter (where j.approved_at is not null and j.ai_total is not null and j.lines_changed = 0))::int,
           (count(*) filter (where j.approved_at is not null and j.ai_total is not null and abs(j.final_total - j.ai_total) <= 1))::int,
           sum(j.n)::int, coalesce(sum(j.ti), 0)::bigint, coalesce(sum(j.tou), 0)::bigint, coalesce(sum(j.cr), 0)::bigint
    from j
    group by grouping sets ((j.school_id, j.work_type), (j.school_id), (j.work_type), ())
  $$;

-- Per school per week: active teachers (did something other than sign in)
-- and approvals. Every week since p_since is present, zero or not.
create function app_oversight_weekly(p_school_id uuid, p_since timestamptz)
  returns table (school_id uuid, week date, active_teachers integer, approvals integer)
  language sql stable security definer set search_path = public, pg_temp
  as $$
    with scope as (select id from app_oversight_scope(p_school_id)),
    weeks as (
      select generate_series(date_trunc('week', p_since), date_trunc('week', now()), interval '1 week')::date as week
    ),
    act as (
      select e.school_id, date_trunc('week', e.created_at)::date as week, count(distinct e.actor_id)::int as n
      from audit_event e join app_user u on u.id = e.actor_id and u.role = 'teacher'
      where e.school_id in (select id from scope) and e.created_at >= date_trunc('week', p_since)
        and e.action not like 'auth.%'
      group by 1, 2
    ),
    apr as (
      select a.school_id, date_trunc('week', a.approved_at)::date as week, count(*)::int as n
      from approval a
      where a.school_id in (select id from scope) and a.reopened_at is null and a.approved_at >= date_trunc('week', p_since)
      group by 1, 2
    )
    select sc.id, w.week, coalesce(act.n, 0), coalesce(apr.n, 0)
    from scope sc cross join weeks w
    left join act on act.school_id = sc.id and act.week = w.week
    left join apr on apr.school_id = sc.id and apr.week = w.week
    order by sc.id, w.week
  $$;

revoke execute on function submission_content_deleted(uuid), app_run_retention(integer),
  app_pending_object_keys(integer), app_forget_object_keys(text[]), app_set_retention(integer),
  app_may_admin_school(uuid), app_request_school_deletion(uuid), app_cancel_school_deletion(uuid),
  app_confirm_school_deletion(uuid), app_oversight_scope(uuid),
  app_oversight_summary(uuid, timestamptz), app_oversight_weekly(uuid, timestamptz) from public;
grant execute on function submission_content_deleted(uuid), app_run_retention(integer),
  app_pending_object_keys(integer), app_forget_object_keys(text[]), app_set_retention(integer),
  app_request_school_deletion(uuid), app_cancel_school_deletion(uuid), app_confirm_school_deletion(uuid),
  app_oversight_summary(uuid, timestamptz), app_oversight_weekly(uuid, timestamptz) to redpen_app;
