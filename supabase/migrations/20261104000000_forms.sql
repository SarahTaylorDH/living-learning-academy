-- Living Learning Academy: website forms (parent, mentor, community, volunteer, course request)
-- Run in Supabase: Dashboard → SQL Editor → New query → paste this file → Run.
-- Safe to run more than once, and safe to run over an earlier version of this file.
--
-- Security model:
--   * The website uses the public publishable/anon key, which may ONLY insert rows.
--   * Nobody can read, change or delete submissions with that key (row-level security).
--   * Staff view and export data in the Supabase dashboard (and later the staff dashboard).
--   * Allowed values match src/assets/js/validate.mjs. Change both together (npm test checks they match).

create extension if not exists pgcrypto;

-- Remove the earliest draft tables if they were ever created (they never held real data).
drop view  if exists public.signups_overview;
drop table if exists public.signup_details;
drop table if exists public.signups;

-- Views are rebuilt at the end, so table columns can change safely.
drop view if exists public.submissions_overview;
drop view if exists public.people;
drop view if exists public.interest_demand;

-- ---------------------------------------------------------------- tables
create table if not exists public.submissions (
  id         uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now()
);
alter table public.submissions
  -- every form
  add column if not exists form_type         text,
  add column if not exists full_name         text,
  add column if not exists email             text,
  add column if not exists phone             text,
  add column if not exists sms_opt_in        boolean not null default false,
  add column if not exists postal_code       text,
  add column if not exists city              text,
  add column if not exists province          text,
  add column if not exists notify_events     boolean not null default false,
  add column if not exists updates_opt_in    boolean not null default false,
  add column if not exists privacy_consent   boolean not null default false,
  add column if not exists consent_version   text,
  add column if not exists source            text,
  -- parent form
  add column if not exists schooling         text[] not null default '{}',
  add column if not exists formats           text[] not null default '{}',
  add column if not exists weekdays          text[] not null default '{}',
  add column if not exists learn_wish        text,
  add column if not exists values_gap        text,
  -- mentor form
  add column if not exists skills            text[] not null default '{}',
  add column if not exists skills_other      text,
  add column if not exists motivation        text,
  add column if not exists has_children      boolean not null default false,
  -- community form (waitlist for the two private Facebook communities)
  add column if not exists communities       text[] not null default '{}',
  add column if not exists teen_permission   boolean not null default false,
  add column if not exists interests         text[] not null default '{}',
  add column if not exists event_request     text,
  -- volunteer form
  add column if not exists help_types        text[] not null default '{}',
  add column if not exists availability      text[] not null default '{}',
  add column if not exists about_you         text,
  -- course request form
  add column if not exists requested         text[] not null default '{}',
  add column if not exists requested_other   text,
  add column if not exists expected_students integer,
  add column if not exists organization_type text,
  add column if not exists organization_name text,
  add column if not exists message           text,
  -- staff only (the website cannot set these)
  add column if not exists staff_status      text not null default 'new',
  add column if not exists staff_notes       text;
-- Columns from an earlier version that are no longer used.
alter table public.submissions drop column if exists applying_for, drop column if exists teen_age_range;

create table if not exists public.submission_children (
  id            uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.submissions(id) on delete cascade,
  created_at    timestamptz not null default now()
);
alter table public.submission_children
  add column if not exists age_range text,
  add column if not exists gender    text,
  add column if not exists interests text[] not null default '{}';

-- ---------------------------------------------------------------- rules (named, so they can be updated later)
do $$
declare
  interest_list text := $l$array['critical-thinking-debate','finance-entrepreneurship','public-speaking','impact-community','faith-freedom','culture-identity','civics-citizenship','creative-arts-media','survival-nature','farming-food','build-serve','self-defence','music-dance','beauty-character','etiquette-character','fitness-character','other']$l$;
  rules text[][] := array[
    -- [table, constraint name, check expression]
    ['submissions','form_type_allowed',        $c$form_type in ('parent','mentor','community','volunteer','course_request')$c$],
    ['submissions','full_name_valid',          $c$char_length(full_name) between 2 and 120$c$],
    ['submissions','email_valid',              $c$char_length(email) <= 254 and email ~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]{2,}$'$c$],
    ['submissions','phone_valid',              $c$phone is null or phone ~ '^[0-9]{10}$'$c$],
    ['submissions','sms_needs_phone',          $c$not sms_opt_in or phone is not null$c$],
    ['submissions','postal_code_valid',        $c$char_length(postal_code) between 2 and 10$c$],
    ['submissions','city_valid',               $c$char_length(city) between 2 and 120$c$],
    ['submissions','province_allowed',         $c$province in ('AB','BC','MB','NB','NL','NS','NT','NU','ON','PE','QC','SK','YT','OUTSIDE')$c$],
    ['submissions','privacy_consent_given',    $c$privacy_consent = true$c$],
    ['submissions','consent_version_valid',    $c$char_length(consent_version) between 1 and 20$c$],
    ['submissions','source_valid',             $c$source is null or char_length(source) <= 40$c$],
    ['submissions','schooling_allowed',        $c$schooling <@ array['public','homeschool','private','alternative']$c$],
    ['submissions','formats_allowed',          $c$formats <@ array['in-person','online','hands-on','weekdays','weekend']$c$],
    ['submissions','weekdays_allowed',         $c$weekdays <@ array['mon','tue','wed','thu','fri']$c$],
    ['submissions','skills_allowed',           'skills <@ ' || interest_list],
    ['submissions','interests_allowed',        'interests <@ ' || interest_list],
    ['submissions','requested_allowed',        'requested <@ ' || interest_list],
    ['submissions','communities_allowed',      $c$communities <@ array['adults','teens']$c$],
    ['submissions','help_types_allowed',       $c$help_types <@ array['events','mentors','other']$c$],
    ['submissions','availability_allowed',     $c$availability <@ array['weekdays','evenings','weekends','occasional']$c$],
    ['submissions','organization_type_allowed',$c$organization_type is null or organization_type in ('family-group','church','school','homeschool-co-op','other')$c$],
    ['submissions','staff_status_allowed',     $c$staff_status in ('new','contacted','approved','declined','archived')$c$],
    ['submissions','text_lengths',             $c$coalesce(char_length(learn_wish),0) <= 2000 and coalesce(char_length(values_gap),0) <= 2000
                                                  and coalesce(char_length(motivation),0) <= 2000 and coalesce(char_length(event_request),0) <= 2000
                                                  and coalesce(char_length(about_you),0) <= 2000 and coalesce(char_length(message),0) <= 2000
                                                  and coalesce(char_length(skills_other),0) <= 200 and coalesce(char_length(requested_other),0) <= 200
                                                  and coalesce(char_length(organization_name),0) <= 120 and coalesce(char_length(staff_notes),0) <= 5000$c$],
    ['submissions','students_range',           $c$expected_students is null or expected_students between 1 and 1000$c$],
    -- each form's required answers
    ['submissions','weekdays_need_days',       $c$not ('weekdays' = any(formats)) or cardinality(weekdays) > 0$c$],
    ['submissions','mentor_needs_answers',     $c$form_type <> 'mentor' or (cardinality(skills) > 0 and char_length(coalesce(motivation,'')) > 0 and phone is not null)$c$],
    ['submissions','community_needs_choice',   $c$form_type <> 'community' or cardinality(communities) > 0 or char_length(coalesce(event_request,'')) > 0$c$],
    ['submissions','teens_need_permission',    $c$not ('teens' = any(communities)) or teen_permission$c$],
    ['submissions','volunteer_needs_help',     $c$form_type <> 'volunteer' or cardinality(help_types) > 0$c$],
    ['submissions','request_needs_courses',    $c$form_type <> 'course_request' or (cardinality(requested) > 0 and expected_students is not null)$c$],
    ['submissions','group_request_needs_phone',$c$form_type <> 'course_request' or organization_type is null or phone is not null$c$],
    ['submission_children','age_range_allowed',$c$age_range in ('6-8','9-11','12-14','15-18')$c$],
    ['submission_children','gender_allowed',   $c$gender in ('male','female')$c$],
    ['submission_children','child_interests_allowed', 'interests <@ ' || interest_list]
  ];
  r text[];
  c record;
begin
  -- Clear every existing check rule on these tables (including unnamed ones from earlier versions),
  -- then add the current set below.
  for c in select conname, conrelid::regclass::text as tbl from pg_constraint
           where contype = 'c' and conrelid in ('public.submissions'::regclass, 'public.submission_children'::regclass) loop
    execute format('alter table %s drop constraint %I', c.tbl, c.conname);
  end loop;
  foreach r slice 1 in array rules loop
    execute format('alter table public.%I drop constraint if exists %I', r[1], r[2]);
    execute format('alter table public.%I add constraint %I check (%s)', r[1], r[2], r[3]);
  end loop;
end $$;

-- Required columns (enforced after the rules above).
alter table public.submissions
  alter column form_type set not null, alter column full_name set not null, alter column email set not null,
  alter column postal_code set not null, alter column city set not null, alter column province set not null,
  alter column consent_version set not null;
alter table public.submission_children
  alter column age_range set not null, alter column gender set not null;

create index if not exists submissions_created_idx on public.submissions (created_at desc);
create index if not exists submissions_type_idx    on public.submissions (form_type);
create index if not exists submissions_email_idx   on public.submissions (lower(email));
create index if not exists submissions_postal_idx  on public.submissions (left(postal_code, 3));
create index if not exists submission_children_sub_idx on public.submission_children (submission_id);
comment on table public.submissions is 'Every website form. Insert-only from the website. Values and faith-related answers may reveal beliefs: limit staff access.';

-- ---------------------------------------------------------------- security
alter table public.submissions         enable row level security;
alter table public.submission_children enable row level security;

revoke all on public.submissions, public.submission_children from anon, authenticated;

grant insert (id, form_type, full_name, email, phone, sms_opt_in, postal_code, city, province, notify_events,
              updates_opt_in, privacy_consent, consent_version, source, schooling, formats, weekdays, learn_wish, values_gap,
              skills, skills_other, motivation, has_children, communities, teen_permission, interests, event_request,
              help_types, availability, about_you, requested, requested_other, expected_students, organization_type,
              organization_name, message)
  on public.submissions to anon;
grant insert (submission_id, age_range, gender, interests) on public.submission_children to anon;

drop policy if exists "website can add submissions" on public.submissions;
create policy "website can add submissions" on public.submissions
  for insert to anon with check (privacy_consent = true);

-- Children may only be added to a PARENT form sent in the last 15 minutes.
-- This helper checks that without giving the website any read access:
create or replace function public.recent_parent_submission(sid uuid)
returns boolean language sql security definer set search_path = public stable as $$
  select exists (select 1 from public.submissions s where s.id = sid and s.form_type = 'parent'
                 and s.created_at > now() - interval '15 minutes');
$$;
revoke all on function public.recent_parent_submission(uuid) from public;
grant execute on function public.recent_parent_submission(uuid) to anon;

drop policy if exists "website can add children" on public.submission_children;
create policy "website can add children" on public.submission_children
  for insert to anon with check (public.recent_parent_submission(submission_id));
-- No select/update/delete policies exist for anon, so those actions are denied.

-- ---------------------------------------------------------------- staff views (dashboard / CSV export)
-- Every submission, newest first, each child as "female 9-11: public-speaking, farming-food".
create view public.submissions_overview with (security_invoker = true) as
select s.created_at, s.form_type, s.full_name, s.email, s.phone, s.sms_opt_in, s.postal_code, s.city, s.province,
       s.notify_events, s.updates_opt_in, s.staff_status,
       (select string_agg(c.gender || ' ' || c.age_range || ': ' || array_to_string(c.interests, ', '), ' | ' order by c.created_at)
          from public.submission_children c where c.submission_id = s.id) as children,
       s.schooling, s.formats, s.weekdays, s.learn_wish, s.values_gap,
       s.skills, s.skills_other, s.motivation, s.has_children,
       s.communities, s.teen_permission, s.interests, s.event_request,
       s.help_types, s.availability, s.about_you,
       s.requested, s.requested_other, s.expected_students, s.organization_type, s.organization_name, s.message,
       s.id
from public.submissions s
order by s.created_at desc;

-- One row per person (matched by email), showing every form they've sent.
-- This is how a mentor who also signed up their children is connected.
create view public.people with (security_invoker = true) as
select lower(email) as email,
       (array_agg(full_name order by created_at desc))[1] as full_name,
       (array_agg(phone order by created_at desc) filter (where phone is not null))[1] as phone,
       (array_agg(postal_code order by created_at desc))[1] as postal_code,
       (array_agg(city order by created_at desc))[1] as city,
       (array_agg(province order by created_at desc))[1] as province,
       array_agg(distinct form_type) as forms_sent,
       bool_or(notify_events) as notify_events,
       bool_or(updates_opt_in) as updates_opt_in,
       bool_or(sms_opt_in) as sms_opt_in,
       min(created_at) as first_seen, max(created_at) as last_seen
from public.submissions
group by lower(email);

-- Demand by area: every child interest and course request, by postal area (first 3 characters).
create view public.interest_demand with (security_invoker = true) as
select left(s.postal_code, 3) as postal_area, s.province, c.age_range, c.gender, unnest(c.interests) as interest, 'child' as source
  from public.submission_children c join public.submissions s on s.id = c.submission_id
union all
select left(postal_code, 3), province, null, null, unnest(requested), 'course_request'
  from public.submissions where form_type = 'course_request';

revoke all on public.submissions_overview, public.people, public.interest_demand from anon, authenticated;
