-- Email sign-up pop-up: it only collects a name and email, but every form row was required to
-- have a postal code, city and province, so every pop-up sign-up was refused (null postal_code).
-- Keep those three required for every other form, and optional only for "updates" sign-ups.
-- Safe to run more than once.
alter table public.submissions
  alter column postal_code drop not null,
  alter column city drop not null,
  alter column province drop not null;
alter table public.submissions drop constraint if exists location_required;
alter table public.submissions add constraint location_required
  check (form_type = 'updates' or (postal_code is not null and city is not null and province is not null));
