-- 0003: school admins can read (not change) pupil work and marks in their school.
-- Founder decision 2026-10-18. Writes stay with the class's teachers, pupil
-- names stay teacher-only (decrypted in the app for teachers only), and
-- authority admins still see none of it.

create policy assignment_school_admin_read on assignment for select
  using (school_id = app_school_id() and app_role() = 'school_admin');
create policy submission_school_admin_read on submission for select
  using (school_id = app_school_id() and app_role() = 'school_admin');
create policy mark_result_school_admin_read on mark_result for select
  using (school_id = app_school_id() and app_role() = 'school_admin');
create policy mark_line_school_admin_read on mark_line for select
  using (school_id = app_school_id() and app_role() = 'school_admin');
create policy approval_school_admin_read on approval for select
  using (school_id = app_school_id() and app_role() = 'school_admin');
