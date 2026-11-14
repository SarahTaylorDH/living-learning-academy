-- Email sign-up pop-up: allow a new form type, "updates", for people who only leave their email.
-- Safe to run more than once.
alter table public.submissions drop constraint if exists form_type_allowed;
alter table public.submissions add constraint form_type_allowed
  check (form_type in ('parent','mentor','community','volunteer','course_request','updates'));
