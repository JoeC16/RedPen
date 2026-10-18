-- 0005 photos: pupil work as photographed pages.
--
-- The image bytes live in private object storage (S3-compatible in
-- production, a local folder in development); this table holds only the key.
-- Names cannot be redacted from a photo, so every upload records the teacher's
-- confirmation that names were cropped out or covered.

create table submission_file (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null,
  class_id uuid not null,
  school_id uuid not null,
  position smallint not null check (position between 1 and 20),
  storage_key text not null unique,
  content_type text not null check (content_type in ('image/jpeg', 'image/png', 'image/webp')),
  bytes integer not null check (bytes > 0 and bytes <= 5242880),
  original_name text check (length(original_name) <= 200),
  names_confirmed_by uuid not null references app_user(id),
  names_confirmed_at timestamptz not null,
  created_at timestamptz not null default now(),
  foreign key (submission_id, class_id, school_id) references submission(id, class_id, school_id) on delete cascade,
  unique (submission_id, position)
);
create index submission_file_submission_idx on submission_file(submission_id);

-- Photos of approved work are locked with the rest of it.
create function submission_file_lock() returns trigger
  language plpgsql
  as $$
  begin
    if submission_is_approved(coalesce(new.submission_id, old.submission_id)) then
      raise exception 'submission is approved; reopen it before changing its photos';
    end if;
    return coalesce(new, old);
  end $$;
create trigger submission_file_lock before insert or update or delete on submission_file
  for each row execute function submission_file_lock();

alter table submission_file enable row level security;
create policy submission_file_teacher on submission_file for all
  using (app_teaches(class_id, school_id)) with check (app_teaches(class_id, school_id));
create policy submission_file_school_admin_read on submission_file for select
  using (school_id = app_school_id() and app_role() = 'school_admin');

grant select, insert, delete on submission_file to redpen_app;

-- Which photos an AI run read, so the review screen can say when the photos
-- have changed since and the transcription and marks may be out of date.
alter table mark_result add column input_file_ids uuid[] not null default '{}';
