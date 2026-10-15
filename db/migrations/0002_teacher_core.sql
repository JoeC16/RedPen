-- 0002 teacher core: assignments, submissions, marking runs, mark lines, approvals.
--
-- Pupil work and marks are visible to the class's teachers only. School admins
-- and authority admins get aggregates through dedicated functions (step 5).
-- class_id and school_id are repeated on every row with composite foreign keys,
-- so a row can never point across classes or schools and policies stay simple.

create type work_type as enum ('short', 'maths', 'essay');
create type submission_status as enum ('todo', 'marking', 'review', 'approved', 'failed');
create type mark_source as enum ('manual', 'ai');

-- Half marks only: 0, 0.5, 1, 1.5 ...
create domain half_mark as numeric(5, 1) check (value >= 0 and value * 2 = round(value * 2));

alter table pupil add constraint pupil_id_class_school_key unique (id, class_id, school_id);

create table assignment (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null,
  school_id uuid not null,
  title text not null check (length(title) between 1 and 200),
  work_type work_type not null,
  scheme_text text not null check (length(scheme_text) <= 50000),
  total_marks integer not null check (total_marks between 1 and 500),
  -- [{ "label": "Q1", "max": 2 }, ...]; maxima sum to total_marks (checked in the app)
  criteria jsonb not null check (jsonb_typeof(criteria) = 'array' and jsonb_array_length(criteria) between 1 and 50),
  scheme_version integer not null default 1,
  created_by uuid not null references app_user(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (class_id, school_id) references class(id, school_id) on delete cascade,
  unique (id, class_id, school_id)
);
create index assignment_class_idx on assignment(class_id, created_at desc);

create table submission (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null,
  pupil_id uuid not null,
  class_id uuid not null,
  school_id uuid not null,
  text text check (length(text) <= 100000),
  absent boolean not null default false,
  status submission_status not null default 'todo',
  -- the teacher's working feedback; snapshotted into approval.final_feedback
  feedback text check (length(feedback) <= 5000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  delete_after timestamptz,
  foreign key (assignment_id, class_id, school_id) references assignment(id, class_id, school_id) on delete cascade,
  foreign key (pupil_id, class_id, school_id) references pupil(id, class_id, school_id) on delete cascade,
  unique (assignment_id, pupil_id),
  unique (id, class_id, school_id)
);
create index submission_assignment_idx on submission(assignment_id);

-- One row per marking run (manual or AI). History is kept: re-marking after a
-- scheme change or a move to another assignment adds a run.
create table mark_result (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null,
  class_id uuid not null,
  school_id uuid not null,
  assignment_id uuid not null,
  scheme_version integer not null,
  run_number integer not null,
  source mark_source not null,
  model text,
  prompt_version text,
  confidence text check (confidence in ('high', 'medium', 'low')),
  flags jsonb not null default '[]'::jsonb,
  transcription text,
  feedback_draft text,
  tokens_in integer,
  tokens_out integer,
  latency_ms integer,
  created_by uuid references app_user(id),
  created_at timestamptz not null default now(),
  foreign key (submission_id, class_id, school_id) references submission(id, class_id, school_id) on delete cascade,
  unique (submission_id, run_number),
  unique (id, class_id, school_id),
  check (source = 'manual' or (model is not null and prompt_version is not null))
);

create table mark_line (
  id uuid primary key default gen_random_uuid(),
  mark_result_id uuid not null,
  class_id uuid not null,
  school_id uuid not null,
  position smallint not null,
  label text not null,
  max integer not null check (max between 0 and 500),
  ai_awarded half_mark,
  final_awarded half_mark,
  evidence text check (length(evidence) <= 500),
  comment text check (length(comment) <= 1000),
  foreign key (mark_result_id, class_id, school_id) references mark_result(id, class_id, school_id) on delete cascade,
  unique (mark_result_id, position),
  check (ai_awarded is null or ai_awarded <= max),
  check (final_awarded is null or final_awarded <= max)
);

-- One row per approval. Reopening stamps reopened_* rather than deleting, so
-- the history of approvals stays.
create table approval (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null,
  class_id uuid not null,
  school_id uuid not null,
  mark_result_id uuid not null references mark_result(id) on delete cascade,
  approved_by uuid not null references app_user(id),
  approved_at timestamptz not null default now(),
  final_total half_mark not null,
  final_feedback text,
  -- agreement data: null when the run was manual (no AI marks to compare)
  ai_total half_mark,
  lines_changed integer,
  reopened_at timestamptz,
  reopened_by uuid references app_user(id),
  reopen_reason text check (length(reopen_reason) <= 500),
  foreign key (submission_id, class_id, school_id) references submission(id, class_id, school_id) on delete cascade
);
create unique index approval_current_idx on approval(submission_id) where reopened_at is null;

-- ---------------------------------------------------------------------------
-- Locks: approved work cannot change until it is reopened.
-- ---------------------------------------------------------------------------
create function submission_is_approved(p_submission_id uuid) returns boolean
  language sql stable security definer set search_path = public, pg_temp
  as $$ select exists (select 1 from submission where id = p_submission_id and status = 'approved') $$;

create function submission_lock() returns trigger
  language plpgsql
  as $$
  begin
    if old.status = 'approved' and new.status = 'approved' and (
         new.text is distinct from old.text or new.absent is distinct from old.absent
         or new.feedback is distinct from old.feedback or new.assignment_id is distinct from old.assignment_id
         or new.pupil_id is distinct from old.pupil_id) then
      raise exception 'submission is approved; reopen it before changing it';
    end if;
    return new;
  end $$;
create trigger submission_lock before update on submission
  for each row execute function submission_lock();

create function mark_line_lock() returns trigger
  language plpgsql
  as $$
  declare sid uuid;
  begin
    select submission_id into sid from mark_result where id = coalesce(new.mark_result_id, old.mark_result_id);
    if submission_is_approved(sid) then
      raise exception 'marks are locked by approval; reopen the submission first';
    end if;
    return coalesce(new, old);
  end $$;
create trigger mark_line_lock before insert or update or delete on mark_line
  for each row execute function mark_line_lock();

-- ---------------------------------------------------------------------------
-- Teachers create their own classes. Done in one function so a teacher can
-- only ever assign themselves to a brand-new class, never to a colleague's.
-- ---------------------------------------------------------------------------
create function app_create_class(p_name text, p_year smallint, p_subject text) returns uuid
  language plpgsql volatile security definer set search_path = public, pg_temp
  as $$
  declare new_id uuid;
  begin
    if app_role() not in ('teacher', 'school_admin') or app_school_id() is null then
      raise exception 'not allowed to create classes';
    end if;
    insert into class (school_id, name, year_group, subject)
      values (app_school_id(), p_name, p_year, p_subject) returning id into new_id;
    if app_role() = 'teacher' then
      insert into class_teacher (class_id, user_id, school_id) values (new_id, app_user_id(), app_school_id());
    end if;
    return new_id;
  end $$;

-- ---------------------------------------------------------------------------
-- Row-level security: teachers of the class only.
-- ---------------------------------------------------------------------------
create function app_teaches(p_class_id uuid, p_school_id uuid) returns boolean
  language sql stable
  as $$ select p_school_id = app_school_id() and app_role() = 'teacher' and app_teaches_class(p_class_id) $$;

alter table assignment enable row level security;
alter table submission enable row level security;
alter table mark_result enable row level security;
alter table mark_line enable row level security;
alter table approval enable row level security;

create policy assignment_teacher on assignment for all
  using (app_teaches(class_id, school_id)) with check (app_teaches(class_id, school_id));
create policy submission_teacher on submission for all
  using (app_teaches(class_id, school_id)) with check (app_teaches(class_id, school_id));
create policy mark_result_teacher on mark_result for all
  using (app_teaches(class_id, school_id)) with check (app_teaches(class_id, school_id));
create policy mark_line_teacher on mark_line for all
  using (app_teaches(class_id, school_id)) with check (app_teaches(class_id, school_id));
create policy approval_teacher on approval for all
  using (app_teaches(class_id, school_id)) with check (app_teaches(class_id, school_id));

grant select, insert, update, delete on assignment, submission, mark_result, mark_line to redpen_app;
grant select, insert, update on approval to redpen_app;

revoke execute on function app_create_class(text, smallint, text), submission_is_approved(uuid) from public;
grant execute on function app_create_class(text, smallint, text), submission_is_approved(uuid), app_teaches(uuid, uuid) to redpen_app;

-- Pupil codes are unique per school, but a teacher can only see their own
-- classes' pupils. Report which of the given codes are already taken anywhere
-- in the caller's school, without revealing anything else about those pupils.
create function app_pupil_codes_taken(p_codes text[]) returns table (code text)
  language sql stable security definer set search_path = public, pg_temp
  as $$ select p.code from pupil p where p.school_id = app_school_id() and p.code = any(p_codes) $$;
revoke execute on function app_pupil_codes_taken(text[]) from public;
grant execute on function app_pupil_codes_taken(text[]) to redpen_app;
